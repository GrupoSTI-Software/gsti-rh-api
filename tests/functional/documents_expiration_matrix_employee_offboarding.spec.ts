import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import { EMPLOYEE_OFFBOARDING_STATUS } from '#modules/employee-offboarding/offboardings/offboardings.constants'
import { toBusinessDateString, todayInBusinessZone } from '#utils/business_date'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
  createPositionFixture,
} from '#tests/helpers/org_chart_fixtures'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import {
  addRoleModulePermissions,
  assertModuleEnforced,
  businessUnitHeaders,
  cleanupTenantActor,
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  type TenantActor,
  type UnitUser,
} from '#tests/helpers/tenant_actor'

/**
 * VLRH-H1792172894406 — bajas programadas en la Matriz de vencimientos
 * (CA1 a CA6, CA9 y CA-S1 a CA-S6). Empresa A con Ventas y Almacén; el actor
 * `rh` tiene la matriz y `employee-offboardings:read` y su rol solo cubre
 * Ventas. Fechas relativas a hoy de negocio (`T`). Todos los asserts filtran
 * por la fuente y por las llaves sembradas: la suite no aísla specs.
 */

const MATRIX = 'documents-expiration-matrix'
const OFFBOARDINGS = 'employee-offboardings'
const SOURCE = 'employee-offboarding'
const MATRIX_URL = '/api/documents-expiration-matrix'
const OFFBOARDINGS_URL = '/api/employee-offboardings'
const NOT_FOUND_KEY = 'vencimiento-no-encontrado'

interface MatrixItemBody {
  key: string
  source: string
  documentName: string
  reference: string | null
  expiresAt: string
  daysToExpire: number
  owner: Record<string, unknown>
  targetId: number | null
  hasFile: boolean
}

const dayOffset = (days: number) => toBusinessDateString(todayInBusinessZone().plus({ days }))
const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
const keyOf = (offboardingId: number) => `${SOURCE}-${offboardingId}`

interface SeededEmployee {
  employeeId: number
  personId: number
  slug: string
}

/** Empleado insertado por tabla (molde `employee_fixture`), con departamento opcional y baja opcional. */
async function insertEmployee(params: {
  businessUnitId: number
  departmentId: number | null
  positionId: number
  label: string
  terminatedDate?: string | null
  deleted?: boolean
}): Promise<SeededEmployee> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Baja',
    personLastname: 'Matriz',
    personSecondLastname: params.label,
    personEmail: `baja-${params.label}-${s}@gsti-tests.local`,
    businessUnitId: params.businessUnitId,
  })
  const code = `BM-${s}`.slice(0, 40)
  const slug = opaqueEmployeeSlug()
  const [employeeId] = await db.table('employees').insert({
    employee_slug: slug,
    employee_sync_id: code,
    employee_code: code,
    employee_first_name: 'Baja',
    employee_last_name: 'Matriz',
    employee_second_last_name: params.label,
    company_id: params.businessUnitId,
    business_unit_id: params.businessUnitId,
    payroll_business_unit_id: params.businessUnitId,
    department_id: params.departmentId,
    position_id: params.positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `baja-work-${params.label}-${s}@gsti-tests.local`,
    employee_terminated_date: params.terminatedDate ?? null,
    employee_deleted_at: params.deleted ? new Date() : null,
    employee_created_at: new Date(),
  })
  return { employeeId: Number(employeeId), personId: person.personId, slug }
}

/** Expediente insertado directo; el estado se escribe tal cual (sin pasar por el servicio). */
async function insertCase(params: {
  employeeId: number
  businessUnitId: number
  plannedDate: string | null
  status?: string
}): Promise<number> {
  const status = params.status ?? EMPLOYEE_OFFBOARDING_STATUS.OPEN
  const [id] = await db.table('employee_offboardings').insert({
    employee_id: params.employeeId,
    business_unit_id: params.businessUnitId,
    employee_offboarding_planned_date: params.plannedDate,
    employee_offboarding_status: status,
    employee_offboarding_origin: 'scheduled',
    employee_offboarding_closed_at:
      status === EMPLOYEE_OFFBOARDING_STATUS.CLOSED ? new Date() : null,
    employee_offboarding_cancelled_at:
      status === EMPLOYEE_OFFBOARDING_STATUS.CANCELLED ? new Date() : null,
    employee_offboarding_created_at: new Date(),
  })
  return Number(id)
}

function getMatrix(client: ApiClient, actor: TenantActor) {
  return client.get(MATRIX_URL).loginAs(actor.user).headers(businessUnitHeaders(actor))
}

function getMatrixAs(client: ApiClient, unitUser: UnitUser, actor: TenantActor) {
  return client.get(MATRIX_URL).loginAs(unitUser.user).headers(businessUnitHeaders(actor))
}

function getItemFile(client: ApiClient, actor: TenantActor, key: string) {
  return client
    .get(`${MATRIX_URL}/items/${key}/file`)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
}

function sourceItems(response: ApiResponse): MatrixItemBody[] {
  const items: MatrixItemBody[] = response.body().data.items
  return items.filter((item) => item.source === SOURCE)
}

test.group('Matriz de vencimientos: bajas programadas (VLRH-H1792172894406)', (group) => {
  let rh: TenantActor | null = null
  let foreign: TenantActor | null = null
  /** Mismo rol de la matriz pero sin `employee-offboardings:read`. */
  let noOffboardings: TenantActor | null = null
  /** Rol de A con permisos pero sin departamentos. */
  let noDepartments: TenantActor | null = null
  let owner: UnitUser | null = null
  const employees: SeededEmployee[] = []
  const caseIds: number[] = []
  const roleDepartmentIds: number[] = []
  const cases: Record<string, number> = {}
  /** Ventas y el puesto de A, para sembrar expedientes dentro de los casos. */
  let ventas = { departmentId: 0, positionId: 0 }
  let ventasName = ''

  const seed = async (
    label: string,
    options: {
      unit?: TenantActor
      departmentId: number | null
      positionId: number
      plannedDate: string | null
      status?: string
      terminatedDate?: string | null
      deleted?: boolean
    }
  ): Promise<number> => {
    const unit = options.unit ?? required(rh, 'el actor')
    const employee = await insertEmployee({
      businessUnitId: unit.businessUnit.businessUnitId,
      departmentId: options.departmentId,
      positionId: options.positionId,
      label,
      terminatedDate: options.terminatedDate,
      deleted: options.deleted,
    })
    employees.push(employee)
    const id = await insertCase({
      employeeId: employee.employeeId,
      businessUnitId: unit.businessUnit.businessUnitId,
      plannedDate: options.plannedDate,
      status: options.status,
    })
    caseIds.push(id)
    cases[label] = id
    return id
  }

  group.setup(async () => {
    await assertModuleEnforced(MATRIX)
    await assertModuleEnforced(OFFBOARDINGS)

    rh = await createTenantActor('matriz-bajas')
    const unitId = rh.businessUnit.businessUnitId
    const ventasDepartment = await createDepartmentFixture(unitId, 'Ventas matriz bajas')
    const almacen = await createDepartmentFixture(unitId, 'Almacen matriz bajas')
    const position = await createPositionFixture(unitId, 'Puesto matriz bajas')
    ventas = { departmentId: ventasDepartment.departmentId, positionId: position.positionId }
    ventasName = ventasDepartment.departmentName
    const v = ventas

    await grantModulePermissions(rh, MATRIX, ['read'])
    await addRoleModulePermissions(rh.role, OFFBOARDINGS, ['read'])
    const [roleDepartmentId] = await db.table('role_departments').insert({
      role_id: rh.role.roleId,
      department_id: ventasDepartment.departmentId,
      role_department_created_at: new Date(),
    })
    roleDepartmentIds.push(Number(roleDepartmentId))

    await seed('E1', { ...v, plannedDate: dayOffset(-1) })
    await seed('E2', { ...v, plannedDate: dayOffset(0) })
    await seed('E3', { ...v, plannedDate: dayOffset(10) })
    await seed('E4', { ...v, plannedDate: dayOffset(30) })
    await seed('E5', { ...v, plannedDate: dayOffset(31) })
    await seed('E6', { ...v, plannedDate: null })
    await seed('E7', {
      ...v,
      plannedDate: dayOffset(-1),
      status: EMPLOYEE_OFFBOARDING_STATUS.CLOSED,
    })
    await seed('E8', {
      ...v,
      plannedDate: dayOffset(-1),
      status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
    })
    await seed('E9', {
      ...v,
      plannedDate: dayOffset(-1),
      deleted: true,
      terminatedDate: dayOffset(-1),
    })
    await seed('E10', {
      departmentId: almacen.departmentId,
      positionId: position.positionId,
      plannedDate: dayOffset(-1),
    })
    await seed('E11', {
      departmentId: null,
      positionId: position.positionId,
      plannedDate: dayOffset(-1),
    })
    await seed('E12', { ...v, plannedDate: dayOffset(5), terminatedDate: dayOffset(-2) })

    // Usuario de A con la matriz pero sin "Acceder a bajas de personal", mismo departamento
    noOffboardings = await createTenantActor('matriz-bajas-sin-permiso')
    await grantModulePermissions(noOffboardings, MATRIX, ['read'])
    // Usuario de A con ambos permisos pero sin departamentos en el rol
    noDepartments = await createTenantActor('matriz-bajas-sin-deptos')
    await grantModulePermissions(noDepartments, MATRIX, ['read'])
    await addRoleModulePermissions(noDepartments.role, OFFBOARDINGS, ['read'])
    // Los dos actores extra nacen con empresa propia: se les presta la de A
    for (const actor of [noOffboardings, noDepartments]) {
      await actor.user.related('businessUnits').attach([unitId])
    }
    const [noOffbRoleDepartmentId] = await db.table('role_departments').insert({
      role_id: noOffboardings.role.roleId,
      department_id: ventasDepartment.departmentId,
      role_department_created_at: new Date(),
    })
    roleDepartmentIds.push(Number(noOffbRoleDepartmentId))

    owner = await createBypassUserInBusinessUnit('owner', 'matriz-bajas-owner', unitId)

    foreign = await createTenantActor('matriz-bajas-ajena')
    const foreignDepartment = await createDepartmentFixture(
      foreign.businessUnit.businessUnitId,
      'Ventas ajena'
    )
    const foreignPosition = await createPositionFixture(
      foreign.businessUnit.businessUnitId,
      'Puesto ajeno'
    )
    await seed('EB', {
      unit: foreign,
      departmentId: foreignDepartment.departmentId,
      positionId: foreignPosition.positionId,
      plannedDate: dayOffset(-1),
    })
  })

  group.teardown(async () => {
    if (caseIds.length > 0) {
      await db.from('employee_offboardings').whereIn('employee_offboarding_id', caseIds).delete()
    }
    if (employees.length > 0) {
      await db
        .from('employees')
        .whereIn(
          'employee_id',
          employees.map((employee) => employee.employeeId)
        )
        .delete()
      await Person.query()
        .whereIn(
          'person_id',
          employees.map((employee) => employee.personId)
        )
        .delete()
    }
    if (roleDepartmentIds.length > 0) {
      await db.from('role_departments').whereIn('role_department_id', roleDepartmentIds).delete()
    }
    await cleanupUnitUser(owner)
    for (const actor of [noOffboardings, noDepartments]) {
      if (actor && rh) {
        await db
          .from('business_unit_users')
          .where('user_id', actor.user.userId)
          .where('business_unit_id', rh.businessUnit.businessUnitId)
          .delete()
      }
      await cleanupTenantActor(actor)
    }
    // El organigrama cuelga de la empresa: sale antes que ella
    if (foreign) await cleanupOrgChartFixtures(foreign.businessUnit.businessUnitId)
    await cleanupTenantActor(foreign)
    if (rh) await cleanupOrgChartFixtures(rh.businessUnit.businessUnitId)
    await cleanupTenantActor(rh)
  })

  test('CA1: vencida (T-1), hoy (0), T+10 y T+30 entran; T+31 no', async ({ client, assert }) => {
    const response = await getMatrix(client, required(rh, 'el actor'))
    response.assertStatus(200)
    const byKey = new Map(sourceItems(response).map((item) => [item.key, item]))

    assert.equal(byKey.get(keyOf(cases.E1))?.daysToExpire, -1)
    assert.equal(byKey.get(keyOf(cases.E2))?.daysToExpire, 0)
    assert.equal(byKey.get(keyOf(cases.E3))?.daysToExpire, 10)
    assert.equal(byKey.get(keyOf(cases.E4))?.daysToExpire, 30)
    assert.isFalse(byKey.has(keyOf(cases.E5)), 'T+31 queda fuera de la ventana')
  })

  test('CA2: forma del item: etiqueta genérica, sin referencia, sin archivo, dueño empleado y sin motivos', async ({
    client,
    assert,
  }) => {
    const response = await getMatrix(client, required(rh, 'el actor'))
    const item = sourceItems(response).find((candidate) => candidate.key === keyOf(cases.E1))
    assert.exists(item)
    assert.sameMembers(Object.keys(item!), [
      'key',
      'source',
      'documentName',
      'reference',
      'expiresAt',
      'daysToExpire',
      'owner',
      'targetId',
      'hasFile',
    ])
    assert.equal(item!.documentName, 'Baja programada')
    assert.isNull(item!.reference)
    assert.isNull(item!.targetId)
    assert.isFalse(item!.hasFile)
    assert.equal(item!.expiresAt, dayOffset(-1))
    const employee = employees.find((candidate) => candidate.slug === item!.owner.employeeSlug)
    assert.exists(employee, 'el dueño es el colaborador sembrado')
    assert.sameMembers(Object.keys(item!.owner), [
      'kind',
      'employeeId',
      'employeeSlug',
      'name',
      'positionName',
      'departmentName',
      'employeeCode',
    ])
    assert.equal(item!.owner.kind, 'employee')
    assert.equal(item!.owner.employeeId, employee!.employeeId)
    assert.equal(item!.owner.departmentName, ventasName)
    const serialized = JSON.stringify(item)
    for (const forbidden of ['Modality', 'Type', 'Notes', 'notes', 'cancellation']) {
      assert.notInclude(serialized, forbidden)
    }
  })

  test('CA3: la fecha es la misma que la ficha: la baja en vivo manda sobre la programada', async ({
    client,
    assert,
  }) => {
    const actor = required(rh, 'el actor')
    const response = await getMatrix(client, actor)
    const item = sourceItems(response).find((candidate) => candidate.key === keyOf(cases.E12))
    assert.exists(
      item,
      'con planned_date sola (T+5) saldría por vencer; con la baja en vivo (T-2) es vencida'
    )
    assert.equal(item!.expiresAt, dayOffset(-2))
    assert.equal(item!.daysToExpire, -2)

    const employee = employees.find((candidate) => candidate.employeeId === item!.owner.employeeId)
    const byEmployee = await client
      .get(`${OFFBOARDINGS_URL}/by-employee/${employee!.employeeId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    byEmployee.assertStatus(200)
    assert.equal(byEmployee.body().data.employeeOffboarding.referenceDate, item!.expiresAt)
  })

  test('CA4: terminado y cancelado no aparecen; al cerrar uno vencido, sale y su descarga da 404', async ({
    client,
    assert,
  }) => {
    const actor = required(rh, 'el actor')
    const before = sourceItems(await getMatrix(client, actor)).map((item) => item.key)
    assert.notInclude(before, keyOf(cases.E7))
    assert.notInclude(before, keyOf(cases.E8))

    const toClose = await seed('E1bis', { ...ventas, plannedDate: dayOffset(-1) })
    assert.include(
      sourceItems(await getMatrix(client, actor)).map((item) => item.key),
      keyOf(toClose)
    )
    await db
      .from('employee_offboardings')
      .where('employee_offboarding_id', toClose)
      .update({ employee_offboarding_status: EMPLOYEE_OFFBOARDING_STATUS.CLOSED })
    assert.notInclude(
      sourceItems(await getMatrix(client, actor)).map((item) => item.key),
      keyOf(toClose)
    )
    const download = await getItemFile(client, actor, keyOf(toClose))
    download.assertStatus(404)
    assert.equal(download.body().key, NOT_FOUND_KEY)
  })

  test('CA5: sin fecha, colaborador dado de baja o sin departamento no aparecen', async ({
    client,
    assert,
  }) => {
    const keys = sourceItems(await getMatrix(client, required(rh, 'el actor'))).map(
      (item) => item.key
    )
    assert.notInclude(keys, keyOf(cases.E6))
    assert.notInclude(keys, keyOf(cases.E9))
    assert.notInclude(keys, keyOf(cases.E11))
  })

  test('CA6: baja vencida sin pendientes atrasados: en la matriz sí, en el filtro de atrasados no', async ({
    client,
    assert,
  }) => {
    const actor = required(rh, 'el actor')
    assert.include(
      sourceItems(await getMatrix(client, actor)).map((item) => item.key),
      keyOf(cases.E1)
    )
    const overdue = await client
      .get(OFFBOARDINGS_URL)
      .qs({ page: 1, limit: 100, overdueOnly: true })
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
    overdue.assertStatus(200)
    const rows: Array<{ employeeOffboardingId: number }> =
      overdue.body().data.employeeOffboardings.data
    assert.notInclude(
      rows.map((row) => row.employeeOffboardingId),
      cases.E1
    )
  })

  test('CA9: la descarga de una baja visible responde archivo-no-encontrado', async ({
    client,
    assert,
  }) => {
    const download = await getItemFile(client, required(rh, 'el actor'), keyOf(cases.E1))
    download.assertStatus(404)
    assert.equal(download.body().key, 'archivo-no-encontrado')
  })

  test('CA-S1: otra empresa no aparece y su descarga es el mismo 404 que un id inexistente', async ({
    client,
    assert,
  }) => {
    const actor = required(rh, 'el actor')
    assert.notInclude(
      sourceItems(await getMatrix(client, actor)).map((item) => item.key),
      keyOf(cases.EB)
    )
    const foreignDownload = await getItemFile(client, actor, keyOf(cases.EB))
    const missingDownload = await getItemFile(client, actor, `${SOURCE}-999999999`)
    foreignDownload.assertStatus(404)
    assert.equal(foreignDownload.body().key, NOT_FOUND_KEY)
    assert.deepEqual(foreignDownload.body(), missingDownload.body())
  })

  test('CA-S2: otro departamento no aparece ni se descarga; sin departamentos, 200 sin bajas', async ({
    client,
    assert,
  }) => {
    const actor = required(rh, 'el actor')
    assert.notInclude(
      sourceItems(await getMatrix(client, actor)).map((item) => item.key),
      keyOf(cases.E10)
    )
    const download = await getItemFile(client, actor, keyOf(cases.E10))
    download.assertStatus(404)
    assert.equal(download.body().key, NOT_FOUND_KEY)

    const response = await getMatrixAs(
      client,
      required(noDepartments, 'el actor sin departamentos'),
      actor
    )
    response.assertStatus(200)
    assert.lengthOf(sourceItems(response), 0)
  })

  test('CA-S3: sin "Acceder a bajas de personal" la matriz sale sin bajas y sin error', async ({
    client,
    assert,
  }) => {
    const actor = required(rh, 'el actor')
    const response = await getMatrixAs(
      client,
      required(noOffboardings, 'el actor sin bajas'),
      actor
    )
    response.assertStatus(200)
    assert.lengthOf(sourceItems(response), 0)

    const viewer = required(noOffboardings, 'el actor sin bajas')
    const download = await client
      .get(`${MATRIX_URL}/items/${keyOf(cases.E1)}/file`)
      .loginAs(viewer.user)
      .headers(businessUnitHeaders(actor))
    download.assertStatus(404)
    assert.equal(download.body().key, NOT_FOUND_KEY)
  })

  test('CA-S4: con la exigencia del módulo apagada en BD la fuente sigue cerrada (fail-closed)', async ({
    client,
    assert,
  }) => {
    const actor = required(rh, 'el actor')
    const viewer = required(noOffboardings, 'el actor sin bajas')
    const before = await setModuleEnforcement(OFFBOARDINGS, false)
    try {
      const response = await getMatrixAs(client, viewer, actor)
      response.assertStatus(200)
      assert.lengthOf(sourceItems(response), 0)
      const download = await client
        .get(`${MATRIX_URL}/items/${keyOf(cases.E1)}/file`)
        .loginAs(viewer.user)
        .headers(businessUnitHeaders(actor))
      download.assertStatus(404)
      assert.equal(download.body().key, NOT_FOUND_KEY)
    } finally {
      await setModuleEnforcement(OFFBOARDINGS, before)
    }
  })

  test('CA-S5: owner sin concesiones explícitas ve la baja vencida (bypass standard)', async ({
    client,
    assert,
  }) => {
    const response = await getMatrixAs(
      client,
      required(owner, 'el owner'),
      required(rh, 'el actor')
    )
    response.assertStatus(200)
    assert.include(
      sourceItems(response).map((item) => item.key),
      keyOf(cases.E1)
    )
  })

  test('CA-S6: llave mal formada responde 422 entrada-invalida', async ({ client, assert }) => {
    const actor = required(rh, 'el actor')
    for (const key of [`${SOURCE}-0`, `${SOURCE}-abc`]) {
      const response = await getItemFile(client, actor, key)
      response.assertStatus(422)
      assert.equal(response.body().key, 'entrada-invalida')
    }
  })
})

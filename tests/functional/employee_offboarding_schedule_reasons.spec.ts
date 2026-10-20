import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
import EmployeeOffboardingItem from '#models/employee_offboarding_item'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '#modules/employee-offboarding/concepts/concepts.constants'
import {
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1792172854107 — programar la baja pide fecha de baja, modalidad y tipo
 * (CA-1 a CA-13). Primera cobertura funcional del `POST` del expediente.
 * Empresa A es la del usuario; B es ajena. Catálogo real: "Cambio de
 * Residencia" aplica a Renuncia; "Bajo Desempeño Operativo" a Despido.
 */

const TEST_PASSWORD = 'MotivosDeBaja123!'
const BASE_PATH = '/api/employee-offboardings'
const CASES_TABLE = EmployeeOffboarding.table
const VALID_INPUT = {
  terminationModality: 'Renuncia',
  terminationType: 'Cambio de Residencia',
}
const VAL_INPUT = { key: 'datos-invalidos', code: 'OFFB.CASE.VAL_INPUT' }
const REASON_INVALID = {
  key: 'motivo-de-baja-invalido',
  code: 'OFFB.CASE.TERMINATION_REASON_INVALID',
}

function asFixture<T>(build: () => Promise<T>): Promise<T> {
  return TenantContext.runUnscoped(build, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
}

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

interface Actor {
  user: User
  person: Person
  role: Role | null
}

interface EmployeeFixture {
  employee: Employee
  person: Person
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Motivos ${label} ${s}`,
    businessUnitSlug: `motivos-de-baja-${label}-${s}`,
    businessUnitLegalName: `Motivos ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createEmployee(unit: BusinessUnit, label: string): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Motivos',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `motivos-${label.toLowerCase()}-${s}@gsti-tests.local`,
    businessUnitId: unit.businessUnitId,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `MB-${s}`
  employee.employeeFirstName = 'Motivos'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `MB-${s}`
  employee.companyId = unit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.employeeTypeId = 1
  employee.employeeTerminatedDate = null
  await employee.save()
  return { employee, person }
}

async function createRootActor(units: BusinessUnit[]): Promise<Actor> {
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()
  return createActor(role, units, false)
}

/** Usuario de la empresa con SOLO los permisos indicados sobre `employee-offboardings`. */
async function createTenantActor(unit: BusinessUnit, permissionSlugs: string[]): Promise<Actor> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Motivos ${s}`,
    roleSlug: `motivos-de-baja-${s}`,
    roleDescription: 'Rol temporal del spec de motivos de la baja',
    roleActive: 1,
    businessUnitId: unit.businessUnitId,
    roleManagementDays: 10,
  })
  for (const slug of permissionSlugs) {
    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', slug)
      .whereHas('systemModule', (query) =>
        query
          .whereNull('system_module_deleted_at')
          .where('system_module_slug', EMPLOYEE_OFFBOARDINGS_MODULE_SLUG)
      )
      .firstOrFail()
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: permission.systemPermissionId,
    })
  }
  return createActor(role, [unit], true)
}

async function createActor(role: Role, units: BusinessUnit[], ownsRole: boolean): Promise<Actor> {
  const s = stamp()
  const email = `motivos-actor-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'Motivos',
    personSecondLastname: s,
    personEmail: email,
    businessUnitId: units[0].businessUnitId,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach(units.map((unit) => unit.businessUnitId))
  return { user, person, role: ownsRole ? role : null }
}

/** Fila del expediente tal como está en BD. */
async function caseRows(employeeId: number) {
  return db
    .from(CASES_TABLE)
    .where('employee_id', employeeId)
    .select(
      'employee_offboarding_id',
      'business_unit_id',
      'employee_offboarding_status',
      'employee_offboarding_origin',
      'employee_offboarding_planned_date',
      'employee_offboarding_planned_modality',
      'employee_offboarding_planned_type',
      'employee_offboarding_termination_date',
      'employee_offboarding_termination_modality',
      'employee_offboarding_termination_type'
    )
    .orderBy('employee_offboarding_id')
}

async function destroyFixtures(
  fixtures: EmployeeFixture[],
  actors: Actor[],
  units: BusinessUnit[]
): Promise<void> {
  const employeeIds = fixtures.map((fixture) => fixture.employee.employeeId)
  if (employeeIds.length > 0) {
    const caseIds = db
      .from(CASES_TABLE)
      .whereIn('employee_id', employeeIds)
      .select('employee_offboarding_id')
    await db
      .from(EmployeeOffboardingItem.table)
      .whereIn('employee_offboarding_id', caseIds)
      .delete()
    await db.from(CASES_TABLE).whereIn('employee_id', employeeIds).delete()
    await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
    await db.from(Employee.table).whereIn('employee_id', employeeIds).delete()
    await db
      .from(Person.table)
      .whereIn(
        'person_id',
        fixtures.map((fixture) => fixture.person.personId)
      )
      .delete()
  }
  for (const actor of actors) {
    await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
    await db.from('api_tokens').where('tokenable_id', actor.user.userId).delete()
    await User.query().where('user_id', actor.user.userId).delete()
    await db.from(Person.table).where('person_id', actor.person.personId).delete()
    if (actor.role) {
      await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
      await db.from('roles').where('role_id', actor.role.roleId).delete()
    }
  }
  for (const unit of units) {
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

test.group('Programar la baja con motivos (VLRH-H1792172854107)', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  let root: Actor
  let creator: Actor
  let readerOnly: Actor
  let noRead: Actor
  const fixtures: EmployeeFixture[] = []
  const actors: Actor[] = []

  const track = async (label: string, unit: BusinessUnit = unitA): Promise<EmployeeFixture> => {
    const fixture = await asFixture(() => createEmployee(unit, label))
    fixtures.push(fixture)
    return fixture
  }

  const schedule = (
    client: ApiClient,
    body: Record<string, unknown>,
    actor: Actor = creator,
    unit: BusinessUnit = unitA
  ) =>
    client
      .post(BASE_PATH)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      .json(body)
      .setup((request) => {
        request.request.ok(() => true)
      })

  const byEmployee = (client: ApiClient, fixture: EmployeeFixture, actor: Actor = creator) =>
    client
      .get(`${BASE_PATH}/by-employee/${fixture.employee.employeeId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      .setup((request) => {
        request.request.ok(() => true)
      })

  const validBody = (fixture: EmployeeFixture, overrides: Record<string, unknown> = {}) => ({
    employeeId: fixture.employee.employeeId,
    plannedDate: '2026-11-30',
    ...VALID_INPUT,
    ...overrides,
  })

  const assertRejected = (
    response: ApiResponse,
    status: number,
    expected: { key: string; code: string }
  ) => {
    response.assertStatus(status)
    response.assertBodyContains(expected)
  }

  group.setup(async () => {
    await asFixture(async () => {
      unitA = await createUnit('a')
      unitB = await createUnit('b')
      root = await createRootActor([unitA, unitB])
      creator = await createTenantActor(unitA, ['read', 'create'])
      readerOnly = await createTenantActor(unitA, ['read', 'update'])
      noRead = await createTenantActor(unitA, ['create'])
      actors.push(root, creator, readerOnly, noRead)
    })
  })

  group.teardown(() => asFixture(() => destroyFixtures(fixtures, actors, [unitA, unitB])))

  test('CA-1: programar con motivos abre el expediente con fecha, modalidad y tipo, sin tocar la copia de la baja', async ({
    client,
    assert,
  }) => {
    const fixture = await track('Completo')
    const response = await schedule(client, validBody(fixture))
    response.assertStatus(201)
    const dto = response.body().data.employeeOffboarding
    assert.equal(dto.employeeOffboardingPlannedDate, '2026-11-30')
    assert.equal(dto.employeeOffboardingPlannedModality, VALID_INPUT.terminationModality)
    assert.equal(dto.employeeOffboardingPlannedType, VALID_INPUT.terminationType)
    assert.isFalse(dto.terminationReasonsPending)
    assert.isNull(dto.terminationSnapshot)
    assert.equal(dto.referenceDate, '2026-11-30')

    const [row] = await caseRows(fixture.employee.employeeId)
    assert.equal(row.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.OPEN)
    assert.equal(row.employee_offboarding_origin, EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED)
    assert.equal(row.employee_offboarding_planned_modality, VALID_INPUT.terminationModality)
    assert.equal(row.employee_offboarding_planned_type, VALID_INPUT.terminationType)
    assert.isNull(row.employee_offboarding_termination_date)
    assert.isNull(row.employee_offboarding_termination_modality)
    assert.isNull(row.employee_offboarding_termination_type)
  })

  test('CA-2: la fecha de baja acepta la semana pasada y el mes siguiente', async ({ client }) => {
    const past = await track('Pasada')
    const future = await track('Futura')
    const lastWeek = await schedule(client, validBody(past, { plannedDate: '2026-10-10' }))
    lastWeek.assertStatus(201)
    const nextMonth = await schedule(client, validBody(future, { plannedDate: '2026-11-17' }))
    nextMonth.assertStatus(201)
  })

  test('CA-3: sin modalidad o sin tipo responde 400 y no abre expediente', async ({
    client,
    assert,
  }) => {
    const fixture = await track('Incompleto')
    const { terminationModality, terminationType, ...base } = validBody(fixture)
    assertRejected(await schedule(client, { ...base, terminationType }), 400, VAL_INPUT)
    assertRejected(await schedule(client, { ...base, terminationModality }), 400, VAL_INPUT)
    assert.lengthOf(await caseRows(fixture.employee.employeeId), 0)
  })

  test('CA-4: fecha mal formada o inexistente responde 400 sin fila nueva', async ({
    client,
    assert,
  }) => {
    const fixture = await track('Fecha')
    assertRejected(
      await schedule(client, validBody(fixture, { plannedDate: '2026-11-3' })),
      400,
      VAL_INPUT
    )
    assertRejected(
      await schedule(client, validBody(fixture, { plannedDate: '2026-02-31' })),
      400,
      VAL_INPUT
    )
    assert.lengthOf(await caseRows(fixture.employee.employeeId), 0)
  })

  test('CA-5: modalidad fuera del catálogo, en minúsculas o sin acento responde 422 sin repetir el valor', async ({
    client,
    assert,
  }) => {
    const fixture = await track('Modalidad')
    for (const terminationModality of ['Me voy', 'renuncia', 'Rescision']) {
      const response = await schedule(client, validBody(fixture, { terminationModality }))
      assertRejected(response, 422, REASON_INVALID)
      const body = response.body()
      assert.notInclude(body.title, terminationModality)
      assert.notInclude(body.detail, terminationModality)
      assert.isNotEmpty(body.title)
      assert.isNotEmpty(body.detail)
    }
    assert.lengthOf(await caseRows(fixture.employee.employeeId), 0)
  })

  test('CA-6: un tipo incompatible con la modalidad, o inexistente, responde 422 sin abrir expediente', async ({
    client,
    assert,
  }) => {
    const fixture = await track('Tipo')
    assertRejected(
      await schedule(client, validBody(fixture, { terminationType: 'Bajo Desempeño Operativo' })),
      422,
      REASON_INVALID
    )
    assertRejected(
      await schedule(client, validBody(fixture, { terminationType: 'Tipo inventado' })),
      422,
      REASON_INVALID
    )
    assert.lengthOf(await caseRows(fixture.employee.employeeId), 0)
  })

  test('CA-7: sin permiso create responde 403 y no crea expediente', async ({ client, assert }) => {
    const fixture = await track('SinCrear')
    const response = await schedule(client, validBody(fixture), readerOnly)
    assertRejected(response, 403, { key: 'sin-permiso', code: 'OFFB.CASE.FORBIDDEN' })
    assert.lengthOf(await caseRows(fixture.employee.employeeId), 0)
  })

  test('CA-8: un colaborador de otra empresa responde 404 uniforme y no crea expediente', async ({
    client,
    assert,
  }) => {
    const foreign = await track('Ajeno', unitB)
    const response = await schedule(client, validBody(foreign))
    assertRejected(response, 404, {
      key: 'colaborador-no-encontrado',
      code: 'OFFB.CASE.EMPLOYEE_NOT_FOUND',
    })
    assert.lengthOf(await caseRows(foreign.employee.employeeId), 0)
  })

  test('CA-9: la segunda alta responde 409 y el expediente conserva los motivos de la primera', async ({
    client,
    assert,
  }) => {
    const fixture = await track('Doble')
    const first = await schedule(client, validBody(fixture))
    first.assertStatus(201)
    const second = await schedule(
      client,
      validBody(fixture, {
        terminationModality: 'Despido',
        terminationType: 'Bajo Desempeño Operativo',
      })
    )
    assertRejected(second, 409, { key: 'expediente-ya-abierto', code: 'OFFB.CASE.ALREADY_OPEN' })
    const rows = await caseRows(fixture.employee.employeeId)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].employee_offboarding_planned_modality, VALID_INPUT.terminationModality)
    assert.equal(rows[0].employee_offboarding_planned_type, VALID_INPUT.terminationType)
  })

  test('CA-10: las llaves no declaradas del cuerpo se ignoran y un businessUnitId ajeno cierra la petición', async ({
    client,
    assert,
  }) => {
    const fixture = await track('Extra')
    // Llaves del expediente que el cuerpo no puede fijar: las descarta el validador
    const response = await schedule(
      client,
      validBody(fixture, {
        employeeOffboardingStatus: EMPLOYEE_OFFBOARDING_STATUS.CLOSED,
        employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
        employeeOffboardingTerminationModality: 'Despido',
      })
    )
    response.assertStatus(201)
    const [row] = await caseRows(fixture.employee.employeeId)
    assert.equal(row.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.OPEN)
    assert.equal(row.business_unit_id, unitA.businessUnitId)
    assert.equal(row.employee_offboarding_origin, EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED)
    assert.isNull(row.employee_offboarding_termination_modality)

    // `businessUnitId` lo lee el middleware de alcance antes que el controller:
    // con una empresa a la que el usuario no tiene acceso responde su propio 404
    // y nada llega al servicio (fail-closed, más estricto que ignorar la llave)
    const other = await track('ExtraAjena')
    const injected = await schedule(
      client,
      validBody(other, { businessUnitId: unitB.businessUnitId })
    )
    injected.assertStatus(404)
    assert.equal(injected.body().key, 'BU.NOT.001')
    assert.lengthOf(await caseRows(other.employee.employeeId), 0)
  })

  test('CA-11: el renglón del listado no expone modalidad, tipo ni la marca de motivos', async ({
    client,
    assert,
  }) => {
    const fixture = await track('Listado')
    const created = await schedule(client, validBody(fixture))
    created.assertStatus(201)
    const list = await client
      .get(BASE_PATH)
      .qs({ page: 1, limit: 50 })
      .loginAs(creator.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
    list.assertStatus(200)
    const rows: Array<Record<string, unknown>> = list.body().data.employeeOffboardings.data
    const row = rows.find((candidate) => candidate.employeeId === fixture.employee.employeeId)
    assert.exists(row)
    assert.notProperty(row!, 'employeeOffboardingPlannedModality')
    assert.notProperty(row!, 'employeeOffboardingPlannedType')
    assert.notProperty(row!, 'terminationReasonsPending')
    assert.notInclude(JSON.stringify(row), VALID_INPUT.terminationType)
  })

  test('CA-12: sin read la ficha responde 403 sin modalidad, tipo ni fecha', async ({
    client,
    assert,
  }) => {
    const fixture = await track('SinLeer')
    const created = await schedule(client, validBody(fixture))
    created.assertStatus(201)
    const response = await byEmployee(client, fixture, noRead)
    assertRejected(response, 403, { key: 'sin-permiso', code: 'OFFB.CASE.FORBIDDEN' })
    const serialized = JSON.stringify(response.body())
    assert.notInclude(serialized, VALID_INPUT.terminationModality)
    assert.notInclude(serialized, VALID_INPUT.terminationType)
    assert.notInclude(serialized, '2026-11-30')
  })

  test('CA-13: sin motivos, la marca solo aplica al expediente en curso; la baja directa abre el expediente sin motivos', async ({
    client,
    assert,
  }) => {
    // Expedientes sembrados sin motivos en cada estado
    const expectations: Array<[string, boolean]> = [
      [EMPLOYEE_OFFBOARDING_STATUS.OPEN, true],
      [EMPLOYEE_OFFBOARDING_STATUS.CLOSED, false],
      [EMPLOYEE_OFFBOARDING_STATUS.CANCELLED, false],
    ]
    for (const [status, pending] of expectations) {
      const fixture = await track(`Sin${status}`)
      await EmployeeOffboarding.create({
        employeeId: fixture.employee.employeeId,
        businessUnitId: unitA.businessUnitId,
        employeeOffboardingPlannedDate: '2026-10-01',
        employeeOffboardingStatus: status,
        employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED,
        employeeOffboardingNotes: null,
        employeeOffboardingOpenedByUserId: null,
      })
      const response = await byEmployee(client, fixture)
      response.assertStatus(200)
      const dto = response.body().data.employeeOffboarding
      assert.equal(dto.terminationReasonsPending, pending, status)
      assert.isNull(dto.employeeOffboardingPlannedModality)
      assert.isNull(dto.employeeOffboardingPlannedType)
    }

    // La baja directa abre el expediente en automático y no escribe motivos (R7)
    const direct = await track('BajaDirecta')
    const terminated = await client
      .delete(`/api/employees/${direct.employee.employeeId}`)
      .loginAs(root.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      .json({
        employeeTerminatedDate: '2026-10-15',
        employeeTerminationModality: 'Renuncia',
        employeeTerminationType: 'Cambio de Residencia',
      })
    terminated.assertStatus(201)
    const [row] = await caseRows(direct.employee.employeeId)
    assert.equal(row.employee_offboarding_origin, EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION)
    assert.isNull(row.employee_offboarding_planned_modality)
    assert.isNull(row.employee_offboarding_planned_type)
    const directResponse = await byEmployee(client, direct)
    assert.isTrue(directResponse.body().data.employeeOffboarding.terminationReasonsPending)
  })
})

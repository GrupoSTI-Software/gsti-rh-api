import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
import EmployeeOffboardingDocument from '#models/employee_offboarding_document'
import EmployeeOffboardingItem from '#models/employee_offboarding_item'
import EmployeeOffboardingItemEvidence from '#models/employee_offboarding_item_evidence'
import Person from '#models/person'
import Position from '#models/position'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '#modules/employee-offboarding/concepts/concepts.constants'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE } from '#modules/employee-offboarding/documents/documents.constants'
import {
  EMPLOYEE_OFFBOARDING_ITEM_STATUS,
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1790812613830 — el expediente cancelado al deshacer la baja es de solo
 * lectura (CA-6, CA-7), el cerrado conserva lo que hoy permite (CA-8) y la
 * ficha y el listado lo pintan con su rastro y sin atrasados (CA-9). Fixtures
 * propias por inserción directa; las escrituras se rechazan antes de tocar S3.
 *
 * VLRH-H1791055795208 (segundo grupo) — lectura del cancelado: la fecha de
 * salida es la de la baja deshecha (snapshot primero, también en el orden),
 * filtro `status=cancelled`, `terminationSnapshot` en la ficha y la salida
 * cancelada nunca cuenta como baja ejecutada ni como faltante de constancia.
 */

const TEST_PASSWORD = 'ExpedienteCancelado123!'
const BASE_PATH = '/api/employee-offboardings'
const PAST_DATE = '2026-01-15'
const CANCELLED_READ_ONLY = {
  title: 'Expediente cancelado',
  key: 'expediente-cancelado',
  code: 'OFFB.CASE.CANCELLED_READ_ONLY',
}
const CLOSED_READ_ONLY = { key: 'expediente-cerrado', code: 'OFFB.CASE.CLOSED_READ_ONLY' }
const PDF_BYTES = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

function asFixture<T>(build: () => Promise<T>): Promise<T> {
  return TenantContext.runUnscoped(build, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
}

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

interface Actor {
  user: User
  person: Person
}

interface CaseFixture {
  employee: Employee
  person: Person
  offboarding: EmployeeOffboarding
  pendingItem: EmployeeOffboardingItem
  completedItem: EmployeeOffboardingItem
  evidence: EmployeeOffboardingItemEvidence
}

async function createUnit(): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Cancelado ${s}`,
    businessUnitSlug: `expediente-cancelado-${s}`,
    businessUnitLegalName: `Expediente Cancelado Legal ${s}, S.A. de C.V.`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

/** Usuario root (bypass de permisos) con el nombre dado; viaja como autor de la cancelación. */
async function createRootActor(
  unit: BusinessUnit,
  names: { first: string; last: string }
): Promise<Actor> {
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()
  const s = stamp()
  const email = `expediente-cancelado-${s}@gsti-tests.local`
  // Con empresa: la persona del usuario compone el filtro de empresa y sin él
  // la autoría del DTO caería al correo
  const person = await Person.create({
    personFirstname: names.first,
    personLastname: names.last,
    personSecondLastname: '',
    personEmail: email,
    businessUnitId: unit.businessUnitId,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([unit.businessUnitId])
  return { user, person }
}

async function createPosition(unit: BusinessUnit): Promise<Position> {
  const position = new Position()
  position.positionSyncId = 0
  position.positionCode = `EC-${stamp()}`.slice(0, 50)
  position.positionName = 'Analista de Nómina'
  position.positionActive = 1
  position.businessUnitId = unit.businessUnitId
  await position.save()
  return position
}

/**
 * Colaborador con datos suficientes para emitir la constancia. Con fecha, la
 * baja queda EJECUTADA (borrado lógico); con `null` el colaborador está activo.
 */
async function createTerminatedEmployee(
  unit: BusinessUnit,
  position: Position,
  label: string,
  terminatedDate: string | null = PAST_DATE
): Promise<{ employee: Employee; person: Person }> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Prueba',
    personLastname: label,
    personSecondLastname: 'Cancelado',
    personEmail: `cancelado-${label.toLowerCase()}-${s}@gsti-tests.local`,
    businessUnitId: unit.businessUnitId,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `EC-${s}`
  employee.employeeFirstName = 'Prueba'
  employee.employeeLastName = label
  employee.employeeSecondLastName = 'Cancelado'
  employee.employeePayrollNum = `EC-${s}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.positionId = position.positionId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.employeeHireDate = DateTime.fromISO('2022-01-10')
  employee.employeeTerminatedDate = terminatedDate
  await employee.save()
  if (terminatedDate !== null) {
    await db
      .from(Employee.table)
      .where('employee_id', employee.employeeId)
      .update({ employee_deleted_at: DateTime.utc().toSQL({ includeOffset: false }) })
  }
  return { employee, person }
}

/** Expediente en el estado dado con un pendiente vencido, uno cumplido y una evidencia. */
async function createCase(
  unit: BusinessUnit,
  position: Position,
  label: string,
  status: string,
  cancelledByUserId: number | null
): Promise<CaseFixture> {
  const { employee, person } = await createTerminatedEmployee(unit, position, label)
  const isCancelled = status === EMPLOYEE_OFFBOARDING_STATUS.CANCELLED
  const isClosed = status === EMPLOYEE_OFFBOARDING_STATUS.CLOSED
  const offboarding = await EmployeeOffboarding.create({
    employeeId: employee.employeeId,
    businessUnitId: unit.businessUnitId,
    employeeOffboardingPlannedDate: PAST_DATE,
    employeeOffboardingStatus: status,
    employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
    employeeOffboardingNotes: null,
    employeeOffboardingOpenedByUserId: null,
    employeeOffboardingClosedAt: isClosed ? DateTime.utc() : null,
    employeeOffboardingClosedByUserId: null,
    employeeOffboardingCancelledAt: isCancelled ? DateTime.utc() : null,
    employeeOffboardingCancelledByUserId: isCancelled ? cancelledByUserId : null,
  })
  const pendingItem = await EmployeeOffboardingItem.create({
    employeeOffboardingId: offboarding.employeeOffboardingId,
    offboardingConceptId: null,
    employeeSupplyId: null,
    employeeOffboardingItemName: 'Devolver equipo',
    employeeOffboardingItemStatus: EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING,
    employeeOffboardingItemAmount: null,
    employeeOffboardingItemNote: null,
    employeeOffboardingItemCompletedAt: null,
    employeeOffboardingItemCompletedByUserId: null,
  })
  const completedItem = await EmployeeOffboardingItem.create({
    employeeOffboardingId: offboarding.employeeOffboardingId,
    offboardingConceptId: null,
    employeeSupplyId: null,
    employeeOffboardingItemName: 'Entregar gafete',
    employeeOffboardingItemStatus: EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED,
    employeeOffboardingItemAmount: null,
    employeeOffboardingItemNote: null,
    employeeOffboardingItemCompletedAt: DateTime.utc(),
    employeeOffboardingItemCompletedByUserId: null,
  })
  const evidence = await EmployeeOffboardingItemEvidence.create({
    employeeOffboardingItemId: pendingItem.employeeOffboardingItemId,
    employeeOffboardingItemEvidenceFile: `tests/evidences/${stamp()}.pdf`,
    employeeOffboardingItemEvidenceOriginalName: 'comprobante.pdf',
  })
  return { employee, person, offboarding, pendingItem, completedItem, evidence }
}

/** Conteos vivos del expediente: pendientes por estado, evidencias y documentos. */
async function snapshot(offboardingId: number) {
  const items = await db
    .from(EmployeeOffboardingItem.table)
    .where('employee_offboarding_id', offboardingId)
    .select(
      'employee_offboarding_item_id',
      'employee_offboarding_item_status',
      'employee_offboarding_item_note'
    )
    .orderBy('employee_offboarding_item_id')
  const evidences = await db
    .from(EmployeeOffboardingItemEvidence.table)
    .whereIn(
      'employee_offboarding_item_id',
      items.map((row) => row.employee_offboarding_item_id)
    )
    .whereNull('employee_offboarding_item_evidence_deleted_at')
    .count('* as total')
  const documents = await db
    .from(EmployeeOffboardingDocument.table)
    .where('employee_offboarding_id', offboardingId)
    .count('* as total')
  const [offboarding] = await db
    .from(EmployeeOffboarding.table)
    .where('employee_offboarding_id', offboardingId)
    .select('employee_offboarding_status', 'employee_offboarding_closed_at')
  return {
    items,
    evidences: Number(evidences[0].total),
    documents: Number(documents[0].total),
    status: offboarding.employee_offboarding_status,
    closedAt: offboarding.employee_offboarding_closed_at,
  }
}

async function destroyFixtures(
  cases: CaseFixture[],
  actors: Actor[],
  positions: Position[],
  units: BusinessUnit[]
): Promise<void> {
  const caseIds = cases.map((fixture) => fixture.offboarding.employeeOffboardingId)
  if (caseIds.length > 0) {
    const itemIds = db
      .from(EmployeeOffboardingItem.table)
      .whereIn('employee_offboarding_id', caseIds)
      .select('employee_offboarding_item_id')
    await db
      .from(EmployeeOffboardingItemEvidence.table)
      .whereIn('employee_offboarding_item_id', itemIds)
      .delete()
    await db
      .from(EmployeeOffboardingItem.table)
      .whereIn('employee_offboarding_id', caseIds)
      .delete()
    await db
      .from(EmployeeOffboardingDocument.table)
      .whereIn('employee_offboarding_id', caseIds)
      .delete()
    await db.from(EmployeeOffboarding.table).whereIn('employee_offboarding_id', caseIds).delete()
    await db
      .from(Employee.table)
      .whereIn(
        'employee_id',
        cases.map((fixture) => fixture.employee.employeeId)
      )
      .delete()
    await db
      .from(Person.table)
      .whereIn(
        'person_id',
        cases.map((fixture) => fixture.person.personId)
      )
      .delete()
  }
  for (const actor of actors) {
    await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
    await db.from('api_tokens').where('tokenable_id', actor.user.userId).delete()
    await User.query().where('user_id', actor.user.userId).delete()
    await db.from(Person.table).where('person_id', actor.person.personId).delete()
  }
  for (const position of positions) {
    await db.from(Position.table).where('position_id', position.positionId).delete()
  }
  for (const unit of units) {
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

test.group('Expediente cancelado: solo lectura (VLRH-H1790812613830)', (group) => {
  let unit: BusinessUnit
  let position: Position
  let root: Actor
  let ana: Actor
  let cancelled: CaseFixture
  let cancelledWithoutUser: CaseFixture
  let closed: CaseFixture
  const cases: CaseFixture[] = []
  const actors: Actor[] = []

  const asRoot = (request: ReturnType<ApiClient['put']>) =>
    request
      .loginAs(root.user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      .setup((req) => {
        req.request.ok(() => true)
      })

  const casePath = (fixture: CaseFixture) =>
    `${BASE_PATH}/${fixture.offboarding.employeeOffboardingId}`
  const itemPath = (fixture: CaseFixture, item: EmployeeOffboardingItem) =>
    `${casePath(fixture)}/items/${item.employeeOffboardingItemId}`

  const assertReadOnly = (
    assert: Assert,
    response: ApiResponse,
    expected: { key: string; code: string; title?: string }
  ) => {
    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.key, expected.key)
    assert.equal(body.code, expected.code)
    if (expected.title) assert.equal(body.title, expected.title)
    assert.isNotEmpty(body.detail ?? body.message)
  }

  group.setup(async () => {
    await asFixture(async () => {
      unit = await createUnit()
      position = await createPosition(unit)
      root = await createRootActor(unit, { first: 'Usuario', last: 'Raíz' })
      ana = await createRootActor(unit, { first: 'Ana', last: 'López' })
      actors.push(root, ana)
      cancelled = await createCase(
        unit,
        position,
        'Cancelado',
        EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
        ana.user.userId
      )
      cancelledWithoutUser = await createCase(
        unit,
        position,
        'SinUsuario',
        EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
        null
      )
      closed = await createCase(unit, position, 'Cerrado', EMPLOYEE_OFFBOARDING_STATUS.CLOSED, null)
      cases.push(cancelled, cancelledWithoutUser, closed)
    })
  })

  group.teardown(() => asFixture(() => destroyFixtures(cases, actors, [position], [unit])))

  test('CA-6: ninguna escritura entra en un expediente cancelado y nada persiste', async ({
    client,
    assert,
  }) => {
    const before = await snapshot(cancelled.offboarding.employeeOffboardingId)

    const attempts: Array<[string, ApiResponse]> = [
      [
        'corregir pendiente',
        await asRoot(client.put(itemPath(cancelled, cancelled.pendingItem))).json({
          employeeOffboardingItemNote: 'nota tardía',
        }),
      ],
      [
        'cumplir pendiente',
        await asRoot(client.put(`${itemPath(cancelled, cancelled.pendingItem)}/complete`)).json({}),
      ],
      [
        'revertir pendiente',
        await asRoot(client.put(`${itemPath(cancelled, cancelled.completedItem)}/revert`)).json({}),
      ],
      [
        'subir evidencia',
        await asRoot(client.post(`${itemPath(cancelled, cancelled.pendingItem)}/evidences`)).file(
          'files',
          PDF_BYTES,
          { filename: 'comprobante.pdf', contentType: 'application/pdf' }
        ),
      ],
      [
        'quitar evidencia',
        await asRoot(
          client.delete(
            `${itemPath(cancelled, cancelled.pendingItem)}/evidences/${cancelled.evidence.employeeOffboardingItemEvidenceId}`
          )
        ),
      ],
      ['dar por terminada', await asRoot(client.patch(`${casePath(cancelled)}/close`))],
      [
        'emitir constancia',
        await asRoot(client.post(`${casePath(cancelled)}/documents`)).json({
          documentType: EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER,
        }),
      ],
      [
        'emitir convenio',
        await asRoot(client.post(`${casePath(cancelled)}/documents`)).json({
          documentType: EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.TERMINATION_AGREEMENT,
        }),
      ],
    ]

    for (const [label, response] of attempts) {
      assert.equal(response.status(), 409, label)
      assertReadOnly(assert, response, CANCELLED_READ_ONLY)
    }
    assert.deepEqual(await snapshot(cancelled.offboarding.employeeOffboardingId), before)
    assert.equal(before.status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
  })

  test('CA-7: un cancelado no se vuelve a abrir y sigue cancelado', async ({ client, assert }) => {
    const response = await asRoot(client.patch(`${casePath(cancelled)}/reopen`))
    assertReadOnly(assert, response, { key: 'expediente-no-cerrado', code: 'OFFB.CASE.NOT_CLOSED' })
    const after = await snapshot(cancelled.offboarding.employeeOffboardingId)
    assert.equal(after.status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
  })

  test('CA-8: el cerrado conserva sus guardas vigentes y sigue emitiendo la constancia', async ({
    client,
    assert,
  }) => {
    const before = await snapshot(closed.offboarding.employeeOffboardingId)

    const complete = await asRoot(
      client.put(`${itemPath(closed, closed.pendingItem)}/complete`)
    ).json({})
    assertReadOnly(assert, complete, CLOSED_READ_ONLY)
    const upload = await asRoot(
      client.post(`${itemPath(closed, closed.pendingItem)}/evidences`)
    ).file('files', PDF_BYTES, { filename: 'comprobante.pdf', contentType: 'application/pdf' })
    assertReadOnly(assert, upload, CLOSED_READ_ONLY)
    const close = await asRoot(client.patch(`${casePath(closed)}/close`))
    assertReadOnly(assert, close, {
      key: 'expediente-ya-cerrado',
      code: 'OFFB.CASE.ALREADY_CLOSED',
    })

    const afterGuards = await snapshot(closed.offboarding.employeeOffboardingId)
    assert.deepEqual(afterGuards, before)

    // La emisión sobre un cerrado procede como hoy (regla 3)
    const issue = await asRoot(client.post(`${casePath(closed)}/documents`)).json({
      documentType: EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER,
    })
    issue.assertStatus(201)
    const afterIssue = await snapshot(closed.offboarding.employeeOffboardingId)
    assert.equal(afterIssue.documents, before.documents + 1)
    assert.equal(afterIssue.status, EMPLOYEE_OFFBOARDING_STATUS.CLOSED)
  })

  test('CA-9: la ficha trae el rastro de la cancelación sin atrasados, y el listado lo pinta cancelado', async ({
    client,
    assert,
  }) => {
    const withUser = await asRoot(
      client.get(`${BASE_PATH}/by-employee/${cancelled.employee.employeeId}`)
    )
    withUser.assertStatus(200)
    const dto = withUser.body().data.employeeOffboarding
    assert.equal(dto.employeeOffboardingId, cancelled.offboarding.employeeOffboardingId)
    assert.equal(dto.employeeOffboardingStatus, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.isString(dto.employeeOffboardingCancelledAt)
    assert.isNotNull(DateTime.fromISO(dto.employeeOffboardingCancelledAt).toISODate())
    assert.equal(dto.employeeOffboardingCancelledByUserId, ana.user.userId)
    assert.equal(dto.employeeOffboardingCancelledByUserName, 'Ana López')
    assert.isNull(dto.employeeOffboardingClosedAt)
    // Regla 5: el pendiente vencido del cancelado no cuenta como atrasado
    assert.equal(dto.itemsOverdue, 0)
    assert.lengthOf(dto.items, 2)
    for (const item of dto.items) assert.isFalse(item.isOverdue)

    const withoutUser = await asRoot(
      client.get(`${BASE_PATH}/by-employee/${cancelledWithoutUser.employee.employeeId}`)
    )
    withoutUser.assertStatus(200)
    const dtoWithoutUser = withoutUser.body().data.employeeOffboarding
    assert.equal(dtoWithoutUser.employeeOffboardingStatus, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.isNull(dtoWithoutUser.employeeOffboardingCancelledByUserId)
    assert.isNull(dtoWithoutUser.employeeOffboardingCancelledByUserName)

    const list = await asRoot(client.get(BASE_PATH).qs({ page: 1, limit: 50 }))
    list.assertStatus(200)
    const rows: Array<Record<string, unknown>> = list.body().data.employeeOffboardings.data
    const row = rows.find(
      (candidate) => candidate.employeeOffboardingId === cancelled.offboarding.employeeOffboardingId
    )
    assert.exists(row, 'el listado sin filtro trae el cancelado')
    assert.equal(row!.status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.equal(Number(row!.itemsOverdue), 0)
  })
})

/** Prefijo único de los slugs del grupo de lectura. */
const READ_FIXTURE_PREFIX = 'cancelada-lectura-'

interface SnapshotSeed {
  date: string | null
  modality: string | null
  type: string | null
}

/** Expediente insertado directo con estado, fecha tentativa y, si aplica, la baja deshecha. */
async function createCaseRow(
  unit: BusinessUnit,
  employee: Employee,
  params: { status: string; origin: string; plannedDate: string; snapshot?: SnapshotSeed }
): Promise<EmployeeOffboarding> {
  const isCancelled = params.status === EMPLOYEE_OFFBOARDING_STATUS.CANCELLED
  return await EmployeeOffboarding.create({
    employeeId: employee.employeeId,
    businessUnitId: unit.businessUnitId,
    employeeOffboardingPlannedDate: params.plannedDate,
    employeeOffboardingStatus: params.status,
    employeeOffboardingOrigin: params.origin,
    employeeOffboardingNotes: null,
    employeeOffboardingOpenedByUserId: null,
    employeeOffboardingClosedAt: null,
    employeeOffboardingClosedByUserId: null,
    employeeOffboardingCancelledAt: isCancelled ? DateTime.utc() : null,
    employeeOffboardingCancelledByUserId: null,
    employeeOffboardingTerminationDate: params.snapshot?.date ?? null,
    employeeOffboardingTerminationModality: params.snapshot?.modality ?? null,
    employeeOffboardingTerminationType: params.snapshot?.type ?? null,
  })
}

/** Rol de la empresa con, o sin, `read` sobre `employee-offboardings`. */
async function createReaderRole(unit: BusinessUnit, withRead: boolean): Promise<Role> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Lectura cancelada ${s}`,
    roleSlug: `${READ_FIXTURE_PREFIX}${s}`,
    roleDescription: 'Rol temporal del spec de lectura de salidas canceladas',
    roleActive: 1,
    roleManagementDays: 10,
    businessUnitId: unit.businessUnitId,
  })
  if (withRead) {
    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', 'read')
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
  return role
}

async function createRoleUser(unit: BusinessUnit, role: Role): Promise<Actor> {
  const s = stamp()
  const email = `${READ_FIXTURE_PREFIX}${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Lectura',
    personLastname: 'Cancelada',
    personSecondLastname: '',
    personEmail: email,
    businessUnitId: unit.businessUnitId,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([unit.businessUnitId])
  return { user, person }
}

/** Destruye en orden inverso de FK todo lo que cuelga de las empresas y roles dados. */
async function destroyReadFixtures(
  units: BusinessUnit[],
  roles: Role[],
  actors: Actor[],
  positions: Position[]
): Promise<void> {
  const unitIds = units.map((unit) => unit.businessUnitId)
  const caseIds = db
    .from(EmployeeOffboarding.table)
    .whereIn('business_unit_id', unitIds)
    .select('employee_offboarding_id')
  await db.from(EmployeeOffboardingItem.table).whereIn('employee_offboarding_id', caseIds).delete()
  await db
    .from(EmployeeOffboardingDocument.table)
    .whereIn('employee_offboarding_id', caseIds)
    .delete()
  await db.from(EmployeeOffboarding.table).whereIn('business_unit_id', unitIds).delete()
  const employees = await db
    .from(Employee.table)
    .whereIn('business_unit_id', unitIds)
    .select('employee_id', 'person_id')
  await db
    .from(Employee.table)
    .whereIn(
      'employee_id',
      employees.map((row) => Number(row.employee_id))
    )
    .delete()
  await db
    .from(Person.table)
    .whereIn(
      'person_id',
      employees.map((row) => Number(row.person_id))
    )
    .delete()
  for (const actor of actors) {
    await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
    await db.from('api_tokens').where('tokenable_id', actor.user.userId).delete()
    await User.query().where('user_id', actor.user.userId).delete()
    await db.from(Person.table).where('person_id', actor.person.personId).delete()
  }
  for (const role of roles) {
    await RoleSystemPermission.query().where('role_id', role.roleId).delete()
    await db.from(Role.table).where('role_id', role.roleId).delete()
  }
  for (const position of positions) {
    await db.from(Position.table).where('position_id', position.positionId).delete()
  }
  for (const unit of units) {
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

test.group('Salidas canceladas: fecha, filtro y baja registrada (VLRH-H1791055795208)', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  let positionA: Position
  let positionB: Position
  let readerRole: Role
  let noReadRole: Role
  let reader: Actor
  let noReader: Actor
  /** E1: baja del 08-10 deshecha (cancelado con snapshot) y baja nueva del 09-20 (abierto). */
  let e1Cancelled: EmployeeOffboarding
  let e1Open: EmployeeOffboarding
  /** E2: dado de baja el 09-01, abierto. */
  let e2Open: EmployeeOffboarding
  /** E3: activo, programado para el 07-15. */
  let e3Open: EmployeeOffboarding
  /** E4: reactivado sin expediente posterior; cancelado con snapshot completo (06-01). */
  let e4Employee: Employee
  let e4Cancelled: EmployeeOffboarding
  /** E5: cancelado sin ningún dato de la baja deshecha. */
  let e5Employee: Employee
  let e5Cancelled: EmployeeOffboarding
  /** E6: cancelado con solo la fecha (05-05). */
  let e6Employee: Employee
  let e6Cancelled: EmployeeOffboarding
  /** Empresa B: cancelado con snapshot, invisible desde A. */
  let e7Employee: Employee
  let e7Cancelled: EmployeeOffboarding

  const E1_SNAPSHOT: SnapshotSeed = {
    date: '2026-08-10',
    modality: 'Renuncia',
    type: 'Cambio de Residencia',
  }

  const asActor = (request: ReturnType<ApiClient['get']>, actor: Actor, unit: BusinessUnit) =>
    request
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      .setup((req) => {
        req.request.ok(() => true)
      })

  const list = (query: Record<string, string | number | boolean>, actor: Actor = reader) =>
    asActor(
      client()
        .get(BASE_PATH)
        .qs({ page: 1, limit: 50, ...query }),
      actor,
      unitA
    )

  let client: () => ApiClient

  const rowsOf = (response: ApiResponse): Array<Record<string, unknown>> =>
    response.body().data.employeeOffboardings.data

  const idsOf = (rows: Array<Record<string, unknown>>) =>
    rows.map((row) => Number(row.employeeOffboardingId))

  group.setup(async () => {
    await asFixture(async () => {
      unitA = await createUnit()
      unitB = await createUnit()
      positionA = await createPosition(unitA)
      positionB = await createPosition(unitB)
      readerRole = await createReaderRole(unitA, true)
      noReadRole = await createReaderRole(unitA, false)
      reader = await createRoleUser(unitA, readerRole)
      noReader = await createRoleUser(unitA, noReadRole)

      const e1 = await createTerminatedEmployee(unitA, positionA, 'E1', '2026-09-20')
      e1Cancelled = await createCaseRow(unitA, e1.employee, {
        status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
        origin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
        plannedDate: '2026-08-10',
        snapshot: E1_SNAPSHOT,
      })
      e1Open = await createCaseRow(unitA, e1.employee, {
        status: EMPLOYEE_OFFBOARDING_STATUS.OPEN,
        origin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
        plannedDate: '2026-09-20',
      })
      const e2 = await createTerminatedEmployee(unitA, positionA, 'E2', '2026-09-01')
      e2Open = await createCaseRow(unitA, e2.employee, {
        status: EMPLOYEE_OFFBOARDING_STATUS.OPEN,
        origin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
        plannedDate: '2026-09-01',
      })
      const e3 = await createTerminatedEmployee(unitA, positionA, 'E3', null)
      e3Open = await createCaseRow(unitA, e3.employee, {
        status: EMPLOYEE_OFFBOARDING_STATUS.OPEN,
        origin: EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED,
        plannedDate: '2026-07-15',
      })
      const e4 = await createTerminatedEmployee(unitA, positionA, 'E4', null)
      e4Employee = e4.employee
      e4Cancelled = await createCaseRow(unitA, e4.employee, {
        status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
        origin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
        plannedDate: '2026-06-01',
        snapshot: { date: '2026-06-01', modality: 'Renuncia', type: 'Cambio de Residencia' },
      })
      const e5 = await createTerminatedEmployee(unitA, positionA, 'E5', null)
      e5Employee = e5.employee
      e5Cancelled = await createCaseRow(unitA, e5.employee, {
        status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
        origin: EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED,
        plannedDate: '2026-04-01',
      })
      const e6 = await createTerminatedEmployee(unitA, positionA, 'E6', null)
      e6Employee = e6.employee
      e6Cancelled = await createCaseRow(unitA, e6.employee, {
        status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
        origin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
        plannedDate: '2026-03-01',
        snapshot: { date: '2026-05-05', modality: null, type: null },
      })
      const e7 = await createTerminatedEmployee(unitB, positionB, 'E7', '2026-08-20')
      e7Employee = e7.employee
      e7Cancelled = await createCaseRow(unitB, e7.employee, {
        status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
        origin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
        plannedDate: '2026-08-20',
        snapshot: { date: '2026-08-20', modality: 'Renuncia', type: 'Cambio de Residencia' },
      })
    })
  })

  group.each.setup(({ context }) => {
    client = () => context.client
  })

  group.teardown(() =>
    asFixture(() =>
      destroyReadFixtures(
        [unitA, unitB],
        [readerRole, noReadRole],
        [reader, noReader],
        [positionA, positionB]
      )
    )
  )

  test('CA-1: ?status=cancelled trae solo cancelados, y el de E1 con la fecha de la baja deshecha', async ({
    assert,
  }) => {
    const response = await list({ status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED })
    response.assertStatus(200)
    const rows = rowsOf(response)
    assert.sameMembers(idsOf(rows), [
      e1Cancelled.employeeOffboardingId,
      e4Cancelled.employeeOffboardingId,
      e5Cancelled.employeeOffboardingId,
      e6Cancelled.employeeOffboardingId,
    ])
    for (const row of rows) assert.equal(row.status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    const e1Row = rows.find(
      (row) => Number(row.employeeOffboardingId) === e1Cancelled.employeeOffboardingId
    )!
    // Sin el snapshot sería 2026-09-20, la baja nueva
    assert.equal(e1Row.terminatedDate, '2026-08-10')
    assert.equal(e1Row.referenceDate, '2026-08-10')
    // Confidencialidad: modalidad y tipo no viajan en el renglón
    assert.notInclude(JSON.stringify(e1Row), 'Renuncia')
    assert.notProperty(e1Row, 'terminationSnapshot')
  })

  test('CA-2: el listado ordena por la fecha de salida con el snapshot primero', async ({
    assert,
  }) => {
    const response = await list({})
    response.assertStatus(200)
    assert.deepEqual(idsOf(rowsOf(response)), [
      e1Open.employeeOffboardingId, // 2026-09-20
      e2Open.employeeOffboardingId, // 2026-09-01
      e1Cancelled.employeeOffboardingId, // 2026-08-10 (snapshot, no 09-20)
      e3Open.employeeOffboardingId, // 2026-07-15 tentativa
      e4Cancelled.employeeOffboardingId, // 2026-06-01 snapshot
      e6Cancelled.employeeOffboardingId, // 2026-05-05 snapshot solo fecha
      e5Cancelled.employeeOffboardingId, // 2026-04-01 tentativa, sin snapshot
    ])
  })

  test('CA-3: open y closed excluyen los cancelados; sin filtro aparecen con su etiqueta', async ({
    assert,
  }) => {
    const open = await list({ status: EMPLOYEE_OFFBOARDING_STATUS.OPEN })
    open.assertStatus(200)
    assert.sameMembers(idsOf(rowsOf(open)), [
      e1Open.employeeOffboardingId,
      e2Open.employeeOffboardingId,
      e3Open.employeeOffboardingId,
    ])
    const closed = await list({ status: EMPLOYEE_OFFBOARDING_STATUS.CLOSED })
    closed.assertStatus(200)
    assert.lengthOf(rowsOf(closed), 0)

    const all = await list({})
    const cancelledRow = rowsOf(all).find(
      (row) => Number(row.employeeOffboardingId) === e1Cancelled.employeeOffboardingId
    )
    assert.exists(cancelledRow)
    assert.equal(cancelledRow!.status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
  })

  test('CA-4: la salida cancelada no es baja ejecutada ni faltante de constancia', async ({
    assert,
  }) => {
    const without = await list({ withoutSeparationLetter: true })
    without.assertStatus(200)
    assert.sameMembers(idsOf(rowsOf(without)), [
      e1Open.employeeOffboardingId,
      e2Open.employeeOffboardingId,
    ])

    const all = rowsOf(await list({}))
    const byId = new Map(all.map((row) => [Number(row.employeeOffboardingId), row]))
    assert.equal(byId.get(e1Cancelled.employeeOffboardingId)!.terminationExecuted, false)
    assert.equal(byId.get(e1Open.employeeOffboardingId)!.terminationExecuted, true)
  })

  test('CA-5: la ficha del reactivado trae el snapshot completo y la fecha de la baja deshecha', async ({
    assert,
  }) => {
    const response = await asActor(
      client().get(`${BASE_PATH}/by-employee/${e4Employee.employeeId}`),
      reader,
      unitA
    )
    response.assertStatus(200)
    const dto = response.body().data.employeeOffboarding
    assert.equal(dto.employeeOffboardingId, e4Cancelled.employeeOffboardingId)
    assert.equal(dto.employeeOffboardingStatus, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.deepEqual(dto.terminationSnapshot, {
      date: '2026-06-01',
      modality: 'Renuncia',
      type: 'Cambio de Residencia',
    })
    assert.equal(dto.referenceDate, '2026-06-01')
  })

  test('CA-6: sin datos de la baja deshecha el snapshot es null; con solo la fecha, los demás van null', async ({
    assert,
  }) => {
    const empty = await asActor(
      client().get(`${BASE_PATH}/by-employee/${e5Employee.employeeId}`),
      reader,
      unitA
    )
    empty.assertStatus(200)
    assert.isNull(empty.body().data.employeeOffboarding.terminationSnapshot)
    // Sin snapshot ni baja en vivo, la fecha de referencia cae a la tentativa
    assert.equal(empty.body().data.employeeOffboarding.referenceDate, '2026-04-01')

    const dateOnly = await asActor(
      client().get(`${BASE_PATH}/by-employee/${e6Employee.employeeId}`),
      reader,
      unitA
    )
    dateOnly.assertStatus(200)
    assert.deepEqual(dateOnly.body().data.employeeOffboarding.terminationSnapshot, {
      date: '2026-05-05',
      modality: null,
      type: null,
    })
  })

  test('CA-7: el cancelado de otra empresa no aparece ni se consulta por colaborador', async ({
    assert,
  }) => {
    const response = await list({ status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED })
    response.assertStatus(200)
    assert.notInclude(idsOf(rowsOf(response)), e7Cancelled.employeeOffboardingId)

    const byEmployee = await asActor(
      client().get(`${BASE_PATH}/by-employee/${e7Employee.employeeId}`),
      reader,
      unitA
    )
    byEmployee.assertStatus(404)
    assert.equal(byEmployee.body().key, 'colaborador-no-encontrado')
    assert.equal(byEmployee.body().code, 'OFFB.CASE.EMPLOYEE_NOT_FOUND')
  })

  test('CA-8: sin read sobre Bajas de personal el filtro responde 403', async ({ assert }) => {
    const response = await list({ status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED }, noReader)
    response.assertStatus(403)
    assert.equal(response.body().key, 'sin-permiso')
    assert.equal(response.body().code, 'OFFB.CASE.FORBIDDEN')
    assert.isNotEmpty(response.body().title)
    assert.isNotEmpty(response.body().detail ?? response.body().message)
  })

  test('CA-9: un estado fuera del enum responde 400 datos-invalidos', async ({ assert }) => {
    const response = await list({ status: 'canceled' })
    response.assertStatus(400)
    assert.equal(response.body().key, 'datos-invalidos')
    assert.equal(response.body().code, 'OFFB.CASE.VAL_INPUT')
  })
})

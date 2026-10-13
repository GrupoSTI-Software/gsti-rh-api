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
import User from '#models/user'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
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

/** Colaborador con la baja EJECUTADA (borrado lógico) y datos suficientes para emitir la constancia. */
async function createTerminatedEmployee(
  unit: BusinessUnit,
  position: Position,
  label: string
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
  employee.employeeTerminatedDate = PAST_DATE
  await employee.save()
  await db
    .from(Employee.table)
    .where('employee_id', employee.employeeId)
    .update({ employee_deleted_at: DateTime.utc().toSQL({ includeOffset: false }) })
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

import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import { DateTime } from 'luxon'
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
  EMPLOYEE_OFFBOARDING_ITEM_STATUS,
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'
import { ensureRole } from '#tests/helpers/ensure_role'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1792172886315 — cancelar la baja programada de un expediente en curso
 * con nota de motivo (CA1 a CA11). Empresa A es la del usuario; B es ajena.
 * La cancelación no toca al colaborador ni lo registrado: los asserts comparan
 * la fila completa antes y después, siempre por ids sembrados.
 */

const TEST_PASSWORD = 'CancelarBaja123!'
const BASE_PATH = '/api/employee-offboardings'
const CASES_TABLE = EmployeeOffboarding.table
const ORIGINAL = {
  plannedDate: '2026-11-30',
  modality: 'Renuncia',
  type: 'Cambio de Residencia',
  notes: 'Entrega pendiente',
}
const TERMINATED = {
  date: '2026-09-15',
  modality: 'Renuncia',
  type: 'Cambio de Residencia',
}
const NOTE_RAW = '  El colaborador decidió quedarse  '
const NOTE = 'El colaborador decidió quedarse'
const CANCELLED_MESSAGE = 'La baja programada se canceló correctamente'
const CANCELLED_READ_ONLY_DETAIL =
  'La salida está cancelada; el expediente solo se puede consultar.'
const VAL_INPUT = { key: 'datos-invalidos', code: 'OFFB.CASE.VAL_INPUT' }
const FORBIDDEN = { key: 'sin-permiso', code: 'OFFB.CASE.FORBIDDEN' }
const NOT_FOUND = { key: 'expediente-no-encontrado', code: 'OFFB.CASE.NOT_FOUND' }
const CLOSED_READ_ONLY = { key: 'expediente-cerrado', code: 'OFFB.CASE.CLOSED_READ_ONLY' }
const CANCELLED_READ_ONLY = {
  key: 'expediente-cancelado',
  code: 'OFFB.CASE.CANCELLED_READ_ONLY',
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
    businessUnitName: `Cancelar baja ${label} ${s}`,
    businessUnitSlug: `cancelar-baja-${label}-${s}`,
    businessUnitLegalName: `Cancelar baja ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

/** Colaborador activo o, con `terminated`, ya dado de baja (regla 2). */
async function createEmployee(
  unit: BusinessUnit,
  label: string,
  terminated = false
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Cancelar',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `cancelar-${label.toLowerCase()}-${s}@gsti-tests.local`,
    businessUnitId: unit.businessUnitId,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `CB-${s}`
  employee.employeeFirstName = 'Cancelar'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `CB-${s}`
  employee.companyId = unit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.employeeTypeId = 1
  if (terminated) {
    employee.employeeTerminatedDate = TERMINATED.date
    employee.employeeTerminationModality = TERMINATED.modality
    employee.employeeTerminationType = TERMINATED.type
    employee.deletedAt = DateTime.utc().minus({ days: 1 })
  } else {
    employee.employeeTerminatedDate = null
  }
  await employee.save()
  return { employee, person }
}

/** Usuario con un rol global que hace bypass (`root` u `owner`); el rol no se borra al final. */
async function createBypassActor(
  roleSlug: 'root' | 'owner',
  units: BusinessUnit[]
): Promise<Actor> {
  return createActor(await ensureRole(roleSlug), units, false)
}

/** Usuario de la empresa con SOLO los permisos indicados sobre `employee-offboardings`. */
async function createTenantActor(unit: BusinessUnit, permissionSlugs: string[]): Promise<Actor> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Cancelar baja ${s}`,
    roleSlug: `cancelar-baja-${s}`,
    roleDescription: 'Rol temporal del spec de cancelación de la baja programada',
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
  const email = `cancelar-actor-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'Cancelar',
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

interface CaseSeed {
  status?: string
  origin?: string
  /** Un cancelado previo por reactivación lleva la nota en NULL. */
  cancellationNote?: string | null
}

/** Expediente insertado directo con sus motivos programados. */
async function createCase(
  unit: BusinessUnit,
  fixture: EmployeeFixture,
  seed: CaseSeed = {}
): Promise<EmployeeOffboarding> {
  const status = seed.status ?? EMPLOYEE_OFFBOARDING_STATUS.OPEN
  return EmployeeOffboarding.create({
    employeeId: fixture.employee.employeeId,
    businessUnitId: unit.businessUnitId,
    employeeOffboardingPlannedDate: ORIGINAL.plannedDate,
    employeeOffboardingPlannedModality: ORIGINAL.modality,
    employeeOffboardingPlannedType: ORIGINAL.type,
    employeeOffboardingStatus: status,
    employeeOffboardingOrigin: seed.origin ?? EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED,
    employeeOffboardingNotes: ORIGINAL.notes,
    employeeOffboardingOpenedByUserId: null,
    employeeOffboardingClosedAt:
      status === EMPLOYEE_OFFBOARDING_STATUS.CLOSED ? DateTime.utc() : null,
    employeeOffboardingClosedByUserId: null,
    employeeOffboardingCancelledAt:
      status === EMPLOYEE_OFFBOARDING_STATUS.CANCELLED ? DateTime.utc() : null,
    employeeOffboardingCancelledByUserId: null,
    employeeOffboardingCancellationNote: seed.cancellationNote ?? null,
    employeeOffboardingTerminationDate: null,
    employeeOffboardingTerminationModality: null,
    employeeOffboardingTerminationType: null,
  })
}

/** Un pendiente cumplido con importe y uno pendiente (regla 7). */
async function createItems(offboarding: EmployeeOffboarding): Promise<void> {
  await EmployeeOffboardingItem.create({
    employeeOffboardingId: offboarding.employeeOffboardingId,
    offboardingConceptId: null,
    employeeSupplyId: null,
    employeeOffboardingItemName: 'Entregar gafete',
    employeeOffboardingItemStatus: EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED,
    employeeOffboardingItemAmount: 1500.5,
    employeeOffboardingItemNote: 'Pagado en caja',
    employeeOffboardingItemCompletedAt: DateTime.utc().minus({ days: 2 }),
    employeeOffboardingItemCompletedByUserId: null,
  })
  await EmployeeOffboardingItem.create({
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
}

/** Fila del expediente tal como está en BD. */
async function caseRow(offboardingId: number) {
  return db
    .from(CASES_TABLE)
    .where('employee_offboarding_id', offboardingId)
    .select(
      'employee_id',
      'business_unit_id',
      'employee_offboarding_status',
      'employee_offboarding_origin',
      db.raw("DATE_FORMAT(employee_offboarding_planned_date, '%Y-%m-%d') AS planned_date"),
      'employee_offboarding_planned_modality',
      'employee_offboarding_planned_type',
      'employee_offboarding_notes',
      'employee_offboarding_termination_date',
      'employee_offboarding_termination_modality',
      'employee_offboarding_termination_type',
      'employee_offboarding_cancelled_at',
      'employee_offboarding_cancelled_by_user_id',
      'employee_offboarding_cancellation_note'
    )
    .first()
}

/** Datos de la baja del colaborador tal como están en BD. */
async function employeeRow(employeeId: number) {
  return db
    .from(Employee.table)
    .where('employee_id', employeeId)
    .select(
      'employee_deleted_at',
      db.raw("DATE_FORMAT(employee_terminated_date, '%Y-%m-%d') AS terminated_date"),
      'employee_termination_modality',
      'employee_termination_type'
    )
    .first()
}

async function itemRows(offboardingId: number) {
  return db
    .from(EmployeeOffboardingItem.table)
    .where('employee_offboarding_id', offboardingId)
    .orderBy('employee_offboarding_item_id')
    .select(
      'employee_offboarding_item_status',
      'employee_offboarding_item_amount',
      'employee_offboarding_item_note',
      'employee_offboarding_item_completed_at'
    )
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

test.group('Cancelar la baja programada del expediente en curso (VLRH-H1792172886315)', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  let root: Actor
  let owner: Actor
  let editor: Actor
  let creatorOnly: Actor
  const fixtures: EmployeeFixture[] = []
  const actors: Actor[] = []

  const track = async (
    label: string,
    unit: BusinessUnit = unitA,
    terminated = false
  ): Promise<EmployeeFixture> => {
    const fixture = await asFixture(() => createEmployee(unit, label, terminated))
    fixtures.push(fixture)
    return fixture
  }

  const seedCase = async (label: string, seed: CaseSeed = {}, unit: BusinessUnit = unitA) => {
    const fixture = await track(label, unit)
    return asFixture(() => createCase(unit, fixture, seed))
  }

  const cancel = (
    client: ApiClient,
    offboardingId: number | string,
    body: Record<string, unknown>,
    actor: Actor = editor
  ) =>
    client
      .patch(`${BASE_PATH}/${offboardingId}/cancel`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      .json(body)
      .setup((request) => {
        request.request.ok(() => true)
      })

  const assertRejected = (
    response: ApiResponse,
    status: number,
    expected: { key: string; code: string }
  ) => {
    response.assertStatus(status)
    response.assertBodyContains(expected)
  }

  /** Lo programado y la copia de la baja no cambian nunca (regla 7). */
  const assertPlannedUntouched = async (assert: Assert, offboardingId: number) => {
    const row = await caseRow(offboardingId)
    assert.equal(row!.planned_date, ORIGINAL.plannedDate)
    assert.equal(row!.employee_offboarding_planned_modality, ORIGINAL.modality)
    assert.equal(row!.employee_offboarding_planned_type, ORIGINAL.type)
    assert.equal(row!.employee_offboarding_notes, ORIGINAL.notes)
    assert.isNull(row!.employee_offboarding_termination_date)
    assert.isNull(row!.employee_offboarding_termination_modality)
    assert.isNull(row!.employee_offboarding_termination_type)
  }

  /** Un rechazo no deja rastro de cancelación en un expediente en curso. */
  const assertStillOpen = async (assert: Assert, offboardingId: number) => {
    await assertPlannedUntouched(assert, offboardingId)
    const row = await caseRow(offboardingId)
    assert.equal(row!.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.OPEN)
    assert.isNull(row!.employee_offboarding_cancelled_at)
    assert.isNull(row!.employee_offboarding_cancelled_by_user_id)
    assert.isNull(row!.employee_offboarding_cancellation_note)
  }

  group.setup(async () => {
    await asFixture(async () => {
      unitA = await createUnit('a')
      unitB = await createUnit('b')
      root = await createBypassActor('root', [unitA, unitB])
      owner = await createBypassActor('owner', [unitA])
      editor = await createTenantActor(unitA, ['read', 'update'])
      creatorOnly = await createTenantActor(unitA, ['read', 'create'])
      actors.push(root, owner, editor, creatorOnly)
    })
  })

  group.teardown(() => asFixture(() => destroyFixtures(fixtures, actors, [unitA, unitB])))

  test('CA1: cancela con motivo recortado, guarda quién y cuándo, y no toca lo programado, los pendientes ni al colaborador', async ({
    client,
    assert,
  }) => {
    const offboarding = await seedCase('Activo')
    await asFixture(() => createItems(offboarding))
    const itemsBefore = await itemRows(offboarding.employeeOffboardingId)
    const employeeBefore = await employeeRow(offboarding.employeeId)

    const response = await cancel(client, offboarding.employeeOffboardingId, {
      cancellationNote: NOTE_RAW,
    })
    response.assertStatus(200)
    assert.equal(response.body().message, CANCELLED_MESSAGE)
    const dto = response.body().data.employeeOffboarding
    assert.equal(dto.employeeOffboardingStatus, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.equal(dto.employeeOffboardingCancellationNote, NOTE)
    assert.equal(dto.employeeOffboardingCancelledByUserId, editor.user.userId)
    assert.isString(dto.employeeOffboardingCancelledByUserName)
    assert.isString(dto.employeeOffboardingCancelledAt)
    assert.isFalse(dto.terminationReasonsPending)
    assert.isFalse(dto.employeeDeleted)
    assert.equal(dto.employeeOffboardingPlannedDate, ORIGINAL.plannedDate)

    const row = await caseRow(offboarding.employeeOffboardingId)
    assert.equal(row!.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.isNotNull(row!.employee_offboarding_cancelled_at)
    assert.equal(row!.employee_offboarding_cancelled_by_user_id, editor.user.userId)
    assert.equal(row!.employee_offboarding_cancellation_note, NOTE)
    await assertPlannedUntouched(assert, offboarding.employeeOffboardingId)
    assert.deepEqual(await itemRows(offboarding.employeeOffboardingId), itemsBefore)
    assert.deepEqual(await employeeRow(offboarding.employeeId), employeeBefore)
    assert.isNull(employeeBefore!.employee_deleted_at)
    assert.isNull(employeeBefore!.terminated_date)
  })

  test('CA2: la consulta de la ficha trae la nota, quién y cuándo; un cancelado por reactivación trae la nota en null', async ({
    client,
    assert,
  }) => {
    const offboarding = await seedCase('Ficha')
    const cancelled = await cancel(client, offboarding.employeeOffboardingId, {
      cancellationNote: NOTE,
    })
    cancelled.assertStatus(200)

    const byEmployee = await client
      .get(`${BASE_PATH}/by-employee/${offboarding.employeeId}`)
      .loginAs(editor.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
    byEmployee.assertStatus(200)
    const dto = byEmployee.body().data.employeeOffboarding
    assert.equal(dto.employeeOffboardingId, offboarding.employeeOffboardingId)
    assert.equal(dto.employeeOffboardingStatus, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.equal(dto.employeeOffboardingCancellationNote, NOTE)
    assert.isString(dto.employeeOffboardingCancelledByUserName)
    assert.isString(dto.employeeOffboardingCancelledAt)
    assert.isFalse(dto.terminationReasonsPending)

    const byReactivation = await seedCase('Reactivado', {
      status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
    })
    const reactivated = await client
      .get(`${BASE_PATH}/by-employee/${byReactivation.employeeId}`)
      .loginAs(editor.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
    reactivated.assertStatus(200)
    assert.isNull(reactivated.body().data.employeeOffboarding.employeeOffboardingCancellationNote)
  })

  test('CA3: el expediente de un colaborador ya dado de baja se cancela con 200 y el colaborador sigue dado de baja', async ({
    client,
    assert,
  }) => {
    const fixture = await track('DadoDeBaja', unitA, true)
    const offboarding = await asFixture(() =>
      createCase(unitA, fixture, { origin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION })
    )
    const employeeBefore = await employeeRow(fixture.employee.employeeId)
    assert.isNotNull(employeeBefore!.employee_deleted_at)
    assert.equal(employeeBefore!.terminated_date, TERMINATED.date)

    const response = await cancel(client, offboarding.employeeOffboardingId, {
      cancellationNote: NOTE,
    })
    response.assertStatus(200)
    assert.notProperty(response.body(), 'code')
    const dto = response.body().data.employeeOffboarding
    assert.isTrue(dto.employeeDeleted)
    assert.equal(dto.employeeOffboardingStatus, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.equal(dto.employeeOffboardingCancellationNote, NOTE)

    const row = await caseRow(offboarding.employeeOffboardingId)
    assert.equal(row!.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.equal(row!.employee_offboarding_cancellation_note, NOTE)
    assert.deepEqual(await employeeRow(fixture.employee.employeeId), employeeBefore)
  })

  test('CA4: sin nota válida o con id inválido responde 400 y el expediente sigue en curso; 1000 caracteres se aceptan', async ({
    client,
    assert,
  }) => {
    const offboarding = await seedCase('NotaInvalida')
    const id = offboarding.employeeOffboardingId
    assertRejected(await cancel(client, id, {}), 400, VAL_INPUT)
    assertRejected(await cancel(client, id, { cancellationNote: null }), 400, VAL_INPUT)
    assertRejected(await cancel(client, id, { cancellationNote: '   ' }), 400, VAL_INPUT)
    assertRejected(await cancel(client, id, { cancellationNote: 'x'.repeat(1001) }), 400, VAL_INPUT)
    assertRejected(await cancel(client, 'abc', { cancellationNote: NOTE }), 400, VAL_INPUT)
    assertRejected(await cancel(client, 0, { cancellationNote: NOTE }), 400, VAL_INPUT)
    await assertStillOpen(assert, id)

    const exact = await cancel(client, id, { cancellationNote: 'y'.repeat(1000) })
    exact.assertStatus(200)
    assert.lengthOf((await caseRow(id))!.employee_offboarding_cancellation_note, 1000)
  })

  test('CA5: sin permiso update responde 403 antes de mirar el id; owner cancela por bypass', async ({
    client,
    assert,
  }) => {
    const own = await seedCase('SinPermiso')
    const foreign = await seedCase('SinPermisoAjeno', {}, unitB)
    const bodies: Array<Record<string, unknown>> = []
    for (const id of [own.employeeOffboardingId, foreign.employeeOffboardingId, 999_999_999]) {
      const response = await cancel(client, id, { cancellationNote: NOTE }, creatorOnly)
      assertRejected(response, 403, FORBIDDEN)
      bodies.push(response.body())
    }
    assert.deepEqual(bodies[0], bodies[1])
    assert.deepEqual(bodies[0], bodies[2])
    await assertStillOpen(assert, own.employeeOffboardingId)
    await assertStillOpen(assert, foreign.employeeOffboardingId)

    const byOwner = await cancel(
      client,
      own.employeeOffboardingId,
      { cancellationNote: NOTE },
      owner
    )
    byOwner.assertStatus(200)
    assert.equal(
      (await caseRow(own.employeeOffboardingId))!.employee_offboarding_cancelled_by_user_id,
      owner.user.userId
    )
  })

  test('CA6: terminado o ya cancelado responden 409 de solo lectura con aviso neutro y nada cambia', async ({
    client,
    assert,
  }) => {
    const closed = await seedCase('Cerrado', { status: EMPLOYEE_OFFBOARDING_STATUS.CLOSED })
    const closedBefore = await caseRow(closed.employeeOffboardingId)
    assertRejected(
      await cancel(client, closed.employeeOffboardingId, { cancellationNote: NOTE }),
      409,
      CLOSED_READ_ONLY
    )
    assert.deepEqual(await caseRow(closed.employeeOffboardingId), closedBefore)

    const cancelled = await seedCase('Cancelado', {
      status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
    })
    const cancelledBefore = await caseRow(cancelled.employeeOffboardingId)
    assert.isNull(cancelledBefore!.employee_offboarding_cancellation_note)
    const response = await cancel(client, cancelled.employeeOffboardingId, {
      cancellationNote: NOTE,
    })
    assertRejected(response, 409, CANCELLED_READ_ONLY)
    assert.equal(response.body().detail, CANCELLED_READ_ONLY_DETAIL)
    assert.notInclude(response.body().detail, 'reactivar')
    assert.deepEqual(await caseRow(cancelled.employeeOffboardingId), cancelledBefore)
  })

  test('CA7: los expedientes de otra empresa responden el 404 uniforme en cualquier estado', async ({
    client,
    assert,
  }) => {
    const targets = [
      await seedCase('AjenoAbierto', {}, unitB),
      await seedCase('AjenoCerrado', { status: EMPLOYEE_OFFBOARDING_STATUS.CLOSED }, unitB),
      await seedCase('AjenoCancelado', { status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED }, unitB),
    ]
    const missing = await cancel(client, 999_999_999, { cancellationNote: NOTE })
    assertRejected(missing, 404, NOT_FOUND)
    for (const target of targets) {
      const before = await caseRow(target.employeeOffboardingId)
      const response = await cancel(client, target.employeeOffboardingId, {
        cancellationNote: NOTE,
      })
      assertRejected(response, 404, NOT_FOUND)
      assert.equal(response.status(), missing.status())
      assert.deepEqual(response.body(), missing.body())
      assert.deepEqual(await caseRow(target.employeeOffboardingId), before)
    }
  })

  test('CA8: las llaves no declaradas del cuerpo se ignoran; usuario, hora y empresa los fija el servidor', async ({
    client,
    assert,
  }) => {
    const offboarding = await seedCase('Masivo')
    const expectedEmployeeId = offboarding.employeeId
    // `businessUnitId` ajeno en el cuerpo lo rechaza antes el middleware de
    // alcance (404 BU.NOT.001), igual que en el alta y la edición: más estricto
    // que ignorarlo, y el expediente no cambia.
    const foreignUnit = await cancel(client, offboarding.employeeOffboardingId, {
      cancellationNote: NOTE,
      businessUnitId: unitB.businessUnitId,
    })
    foreignUnit.assertStatus(404)
    assert.equal(foreignUnit.body().key, 'BU.NOT.001')
    await assertStillOpen(assert, offboarding.employeeOffboardingId)

    const response = await cancel(client, offboarding.employeeOffboardingId, {
      cancellationNote: NOTE,
      employeeOffboardingStatus: EMPLOYEE_OFFBOARDING_STATUS.OPEN,
      employeeOffboardingCancelledByUserId: 999,
      cancelledAt: '2020-01-01',
      employeeId: 1,
    })
    response.assertStatus(200)
    const row = await caseRow(offboarding.employeeOffboardingId)
    assert.equal(row!.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.equal(row!.employee_offboarding_cancelled_by_user_id, editor.user.userId)
    assert.equal(row!.business_unit_id, unitA.businessUnitId)
    assert.equal(row!.employee_id, expectedEmployeeId)
    const cancelledAt = DateTime.fromJSDate(new Date(row!.employee_offboarding_cancelled_at))
    assert.isTrue(Math.abs(cancelledAt.diffNow('minutes').minutes) < 5)
  })

  test('CA9: dos cancelaciones simultáneas: una 200 y la otra 409; la edición posterior también se rechaza', async ({
    client,
    assert,
  }) => {
    const offboarding = await seedCase('Carrera')
    const id = offboarding.employeeOffboardingId
    const [first, second] = await Promise.all([
      cancel(client, id, { cancellationNote: 'Primera nota' }),
      cancel(client, id, { cancellationNote: 'Segunda nota' }),
    ])
    const statuses = [first.status(), second.status()].sort()
    assert.deepEqual(statuses, [200, 409])
    const winner = first.status() === 200 ? first : second
    const loser = first.status() === 200 ? second : first
    assertRejected(loser, 409, CANCELLED_READ_ONLY)
    assert.equal(
      (await caseRow(id))!.employee_offboarding_cancellation_note,
      winner.body().data.employeeOffboarding.employeeOffboardingCancellationNote
    )

    const edited = await client
      .patch(`${BASE_PATH}/${id}`)
      .loginAs(editor.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      .json({
        plannedDate: '2026-09-01',
        terminationModality: 'Mutuo Acuerdo',
        terminationType: 'Falta de Alineación Cultural',
      })
      .setup((request) => {
        request.request.ok(() => true)
      })
    assertRejected(edited, 409, CANCELLED_READ_ONLY)
    await assertPlannedUntouched(assert, id)
  })

  test('CA10: cerrar un cancelado responde 409 expediente-cancelado; cancelar un cerrado, 409 expediente-cerrado', async ({
    client,
    assert,
  }) => {
    const cancelled = await seedCase('CerrarCancelado')
    const cancelResponse = await cancel(client, cancelled.employeeOffboardingId, {
      cancellationNote: NOTE,
    })
    cancelResponse.assertStatus(200)
    const closeAttempt = await client
      .patch(`${BASE_PATH}/${cancelled.employeeOffboardingId}/close`)
      .loginAs(root.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      .setup((request) => {
        request.request.ok(() => true)
      })
    assertRejected(closeAttempt, 409, CANCELLED_READ_ONLY)
    assert.equal(
      (await caseRow(cancelled.employeeOffboardingId))!.employee_offboarding_status,
      EMPLOYEE_OFFBOARDING_STATUS.CANCELLED
    )

    const open = await seedCase('CancelarCerrado')
    const closed = await client
      .patch(`${BASE_PATH}/${open.employeeOffboardingId}/close`)
      .loginAs(root.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
    closed.assertStatus(200)
    assertRejected(
      await cancel(client, open.employeeOffboardingId, { cancellationNote: NOTE }),
      409,
      CLOSED_READ_ONLY
    )
    const row = await caseRow(open.employeeOffboardingId)
    assert.equal(row!.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.CLOSED)
    assert.isNull(row!.employee_offboarding_cancellation_note)
  })

  test('CA11: el listado de canceladas muestra el expediente sin la nota', async ({
    client,
    assert,
  }) => {
    const offboarding = await seedCase('Listado')
    const cancelled = await cancel(client, offboarding.employeeOffboardingId, {
      cancellationNote: NOTE,
    })
    cancelled.assertStatus(200)

    const list = await client
      .get(BASE_PATH)
      .qs({ page: 1, limit: 100, status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED })
      .loginAs(editor.user)
      .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
    list.assertStatus(200)
    const rows: Array<Record<string, unknown>> = list.body().data.employeeOffboardings.data
    const row = rows.find(
      (item) => item.employeeOffboardingId === offboarding.employeeOffboardingId
    )
    assert.exists(row)
    assert.equal(row!.status, EMPLOYEE_OFFBOARDING_STATUS.CANCELLED)
    assert.notProperty(row!, 'employeeOffboardingCancellationNote')
    assert.notInclude(JSON.stringify(list.body()), NOTE)
  })
})

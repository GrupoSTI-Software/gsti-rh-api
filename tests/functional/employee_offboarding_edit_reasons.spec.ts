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
  EMPLOYEE_OFFBOARDING_ORIGIN,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1792177926178 — editar fecha de baja, motivos y nota de un expediente
 * en curso (CA1 a CA10). Empresa A es la del usuario; B es ajena. Pares del
 * catálogo real: "Falta de Alineación Cultural" aplica a Despido y Mutuo
 * Acuerdo; "Cambio de Residencia" solo a Renuncia.
 */

const TEST_PASSWORD = 'EditarMotivos123!'
const BASE_PATH = '/api/employee-offboardings'
const CASES_TABLE = EmployeeOffboarding.table
const ORIGINAL = {
  plannedDate: '2026-11-30',
  modality: 'Renuncia',
  type: 'Cambio de Residencia',
  notes: 'Entrega pendiente',
}
const VALID_EDIT = {
  plannedDate: '2026-09-01',
  terminationModality: 'Mutuo Acuerdo',
  terminationType: 'Falta de Alineación Cultural',
}
const VAL_INPUT = { key: 'datos-invalidos', code: 'OFFB.CASE.VAL_INPUT' }
const REASON_INVALID = {
  key: 'motivo-de-baja-invalido',
  code: 'OFFB.CASE.TERMINATION_REASON_INVALID',
}
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
    businessUnitName: `Editar motivos ${label} ${s}`,
    businessUnitSlug: `editar-motivos-${label}-${s}`,
    businessUnitLegalName: `Editar motivos ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createEmployee(unit: BusinessUnit, label: string): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Editar',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `editar-${label.toLowerCase()}-${s}@gsti-tests.local`,
    businessUnitId: unit.businessUnitId,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `EM-${s}`
  employee.employeeFirstName = 'Editar'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `EM-${s}`
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
    roleName: `Editar motivos ${s}`,
    roleSlug: `editar-motivos-${s}`,
    roleDescription: 'Rol temporal del spec de edición de motivos',
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
  const email = `editar-actor-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'Editar',
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
  modality?: string | null
  type?: string | null
  notes?: string | null
  /** Copia de la baja deshecha (solo cancelados). */
  snapshot?: { date: string; modality: string; type: string }
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
    employeeOffboardingPlannedModality:
      seed.modality === undefined ? ORIGINAL.modality : seed.modality,
    employeeOffboardingPlannedType: seed.type === undefined ? ORIGINAL.type : seed.type,
    employeeOffboardingStatus: status,
    employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED,
    employeeOffboardingNotes: seed.notes === undefined ? ORIGINAL.notes : seed.notes,
    employeeOffboardingOpenedByUserId: null,
    employeeOffboardingClosedAt:
      status === EMPLOYEE_OFFBOARDING_STATUS.CLOSED ? DateTime.utc() : null,
    employeeOffboardingClosedByUserId: null,
    employeeOffboardingCancelledAt:
      status === EMPLOYEE_OFFBOARDING_STATUS.CANCELLED ? DateTime.utc() : null,
    employeeOffboardingCancelledByUserId: null,
    employeeOffboardingTerminationDate: seed.snapshot?.date ?? null,
    employeeOffboardingTerminationModality: seed.snapshot?.modality ?? null,
    employeeOffboardingTerminationType: seed.snapshot?.type ?? null,
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
      'employee_offboarding_termination_type'
    )
    .first()
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

test.group(
  'Editar los motivos de la baja del expediente en curso (VLRH-H1792177926178)',
  (group) => {
    let unitA: BusinessUnit
    let unitB: BusinessUnit
    let root: Actor
    let editor: Actor
    let creatorOnly: Actor
    const fixtures: EmployeeFixture[] = []
    const actors: Actor[] = []

    const track = async (label: string, unit: BusinessUnit = unitA): Promise<EmployeeFixture> => {
      const fixture = await asFixture(() => createEmployee(unit, label))
      fixtures.push(fixture)
      return fixture
    }

    const openCase = async (label: string, seed: CaseSeed = {}, unit: BusinessUnit = unitA) => {
      const fixture = await track(label, unit)
      return asFixture(() => createCase(unit, fixture, seed))
    }

    const edit = (
      client: ApiClient,
      offboardingId: number | string,
      body: Record<string, unknown>,
      actor: Actor = editor
    ) =>
      client
        .patch(`${BASE_PATH}/${offboardingId}`)
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

    const assertUntouched = async (assert: Assert, offboardingId: number) => {
      const row = await caseRow(offboardingId)
      assert.equal(row!.planned_date, ORIGINAL.plannedDate)
      assert.equal(row!.employee_offboarding_planned_modality, ORIGINAL.modality)
      assert.equal(row!.employee_offboarding_planned_type, ORIGINAL.type)
      assert.equal(row!.employee_offboarding_notes, ORIGINAL.notes)
    }

    group.setup(async () => {
      await asFixture(async () => {
        unitA = await createUnit('a')
        unitB = await createUnit('b')
        root = await createRootActor([unitA, unitB])
        editor = await createTenantActor(unitA, ['read', 'update'])
        creatorOnly = await createTenantActor(unitA, ['read', 'create'])
        actors.push(root, editor, creatorOnly)
      })
    })

    group.teardown(() => asFixture(() => destroyFixtures(fixtures, actors, [unitA, unitB])))

    test('CA1: edita fecha, modalidad y tipo del expediente en curso; la nota ausente se conserva y la copia de la baja no cambia', async ({
      client,
      assert,
    }) => {
      const offboarding = await openCase('Completo')
      const response = await edit(client, offboarding.employeeOffboardingId, VALID_EDIT)
      response.assertStatus(200)
      assert.equal(response.body().message, 'Los datos de la baja se actualizaron correctamente')
      const dto = response.body().data.employeeOffboarding
      assert.equal(dto.employeeOffboardingPlannedDate, VALID_EDIT.plannedDate)
      assert.equal(dto.employeeOffboardingPlannedModality, VALID_EDIT.terminationModality)
      assert.equal(dto.employeeOffboardingPlannedType, VALID_EDIT.terminationType)
      assert.equal(dto.employeeOffboardingNotes, ORIGINAL.notes)
      assert.isFalse(dto.terminationReasonsPending)

      const row = await caseRow(offboarding.employeeOffboardingId)
      assert.equal(row!.planned_date, VALID_EDIT.plannedDate)
      assert.equal(row!.employee_offboarding_planned_modality, VALID_EDIT.terminationModality)
      assert.equal(row!.employee_offboarding_planned_type, VALID_EDIT.terminationType)
      assert.equal(row!.employee_offboarding_notes, ORIGINAL.notes)
      assert.isNull(row!.employee_offboarding_termination_date)
      assert.isNull(row!.employee_offboarding_termination_modality)
      assert.isNull(row!.employee_offboarding_termination_type)

      // Idempotente: el mismo cuerpo dos veces deja lo mismo
      const again = await edit(client, offboarding.employeeOffboardingId, VALID_EDIT)
      again.assertStatus(200)
      assert.equal(
        (await caseRow(offboarding.employeeOffboardingId))!.planned_date,
        VALID_EDIT.plannedDate
      )
    })

    test('CA2: completar los motivos por capturar apaga la marca', async ({ client, assert }) => {
      const offboarding = await openCase('PorCapturar', { modality: null, type: null })
      const response = await edit(client, offboarding.employeeOffboardingId, {
        plannedDate: ORIGINAL.plannedDate,
        terminationModality: 'Renuncia',
        terminationType: 'Cambio de Residencia',
      })
      response.assertStatus(200)
      const dto = response.body().data.employeeOffboarding
      assert.isFalse(dto.terminationReasonsPending)
      assert.equal(dto.employeeOffboardingPlannedModality, 'Renuncia')
    })

    test('CA3: la nota en null o vacía se borra; con texto se reemplaza', async ({
      client,
      assert,
    }) => {
      const offboarding = await openCase('Nota')
      const cleared = await edit(client, offboarding.employeeOffboardingId, {
        ...VALID_EDIT,
        notes: null,
      })
      cleared.assertStatus(200)
      assert.isNull((await caseRow(offboarding.employeeOffboardingId))!.employee_offboarding_notes)

      const replaced = await edit(client, offboarding.employeeOffboardingId, {
        ...VALID_EDIT,
        notes: 'Nueva',
      })
      replaced.assertStatus(200)
      assert.equal(
        (await caseRow(offboarding.employeeOffboardingId))!.employee_offboarding_notes,
        'Nueva'
      )

      const emptied = await edit(client, offboarding.employeeOffboardingId, {
        ...VALID_EDIT,
        notes: '  ',
      })
      emptied.assertStatus(200)
      assert.isNull((await caseRow(offboarding.employeeOffboardingId))!.employee_offboarding_notes)
    })

    test('CA4: datos inválidos responden 400 y el expediente no cambia', async ({
      client,
      assert,
    }) => {
      const offboarding = await openCase('Invalido')
      const { terminationType, ...withoutType } = VALID_EDIT
      assertRejected(
        await edit(client, offboarding.employeeOffboardingId, withoutType),
        400,
        VAL_INPUT
      )
      assertRejected(
        await edit(client, offboarding.employeeOffboardingId, {
          ...VALID_EDIT,
          terminationType,
          plannedDate: '2026-02-31',
        }),
        400,
        VAL_INPUT
      )
      assertRejected(await edit(client, 'abc', VALID_EDIT), 400, VAL_INPUT)
      await assertUntouched(assert, offboarding.employeeOffboardingId)
    })

    test('CA5: la compatibilidad se evalúa contra la modalidad enviada; mayúsculas y acentos cuentan', async ({
      client,
      assert,
    }) => {
      const offboarding = await openCase('Motivo')
      // Tipo compatible con la modalidad GUARDADA (Renuncia) pero no con la enviada
      const crossed = await edit(client, offboarding.employeeOffboardingId, {
        plannedDate: ORIGINAL.plannedDate,
        terminationModality: 'Mutuo Acuerdo',
        terminationType: 'Cambio de Residencia',
      })
      assertRejected(crossed, 422, REASON_INVALID)
      assert.notInclude(crossed.body().title, 'Mutuo Acuerdo')
      assert.notInclude(crossed.body().detail, 'Cambio de Residencia')

      const lowercase = await edit(client, offboarding.employeeOffboardingId, {
        ...VALID_EDIT,
        terminationModality: 'renuncia',
        terminationType: 'Cambio de Residencia',
      })
      assertRejected(lowercase, 422, REASON_INVALID)
      assert.notInclude(lowercase.body().detail, 'renuncia')

      // Se decide sin BD: un id inexistente con motivos inválidos también da 422
      assertRejected(
        await edit(client, 999_999_999, { ...VALID_EDIT, terminationModality: 'renuncia' }),
        422,
        REASON_INVALID
      )
      await assertUntouched(assert, offboarding.employeeOffboardingId)
    })

    test('CA6: sin permiso update responde 403 antes de mirar el id', async ({
      client,
      assert,
    }) => {
      const offboarding = await openCase('SinPermiso')
      assertRejected(
        await edit(client, offboarding.employeeOffboardingId, VALID_EDIT, creatorOnly),
        403,
        {
          key: 'sin-permiso',
          code: 'OFFB.CASE.FORBIDDEN',
        }
      )
      assertRejected(await edit(client, 999_999_999, VALID_EDIT, creatorOnly), 403, {
        key: 'sin-permiso',
        code: 'OFFB.CASE.FORBIDDEN',
      })
      await assertUntouched(assert, offboarding.employeeOffboardingId)
    })

    test('CA7: terminado o cancelado responden 409 de solo lectura y nada cambia, incluida la copia de la baja', async ({
      client,
      assert,
    }) => {
      const closed = await openCase('Cerrado', { status: EMPLOYEE_OFFBOARDING_STATUS.CLOSED })
      assertRejected(
        await edit(client, closed.employeeOffboardingId, VALID_EDIT),
        409,
        CLOSED_READ_ONLY
      )
      await assertUntouched(assert, closed.employeeOffboardingId)

      const snapshot = { date: '2026-08-10', modality: 'Renuncia', type: 'Cambio de Residencia' }
      const cancelled = await openCase('Cancelado', {
        status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED,
        snapshot,
      })
      assertRejected(
        await edit(client, cancelled.employeeOffboardingId, VALID_EDIT),
        409,
        CANCELLED_READ_ONLY
      )
      await assertUntouched(assert, cancelled.employeeOffboardingId)
      const row = await caseRow(cancelled.employeeOffboardingId)
      assert.equal(row!.employee_offboarding_termination_modality, snapshot.modality)
      assert.equal(row!.employee_offboarding_termination_type, snapshot.type)
    })

    test('CA8: si el expediente se cierra mientras otra sesión edita, la edición se rechaza y los motivos del cierre no cambian', async ({
      client,
      assert,
    }) => {
      const offboarding = await openCase('Carrera')
      const closed = await client
        .patch(`${BASE_PATH}/${offboarding.employeeOffboardingId}/close`)
        .loginAs(root.user)
        .header('X-Business-Unit-Id', unitA.businessUnitPublicId)
      closed.assertStatus(200)

      assertRejected(
        await edit(client, offboarding.employeeOffboardingId, VALID_EDIT),
        409,
        CLOSED_READ_ONLY
      )
      await assertUntouched(assert, offboarding.employeeOffboardingId)
      assert.equal(
        (await caseRow(offboarding.employeeOffboardingId))!.employee_offboarding_status,
        EMPLOYEE_OFFBOARDING_STATUS.CLOSED
      )
    })

    test('CA9: los expedientes de otra empresa responden el 404 uniforme en cualquier estado', async ({
      client,
      assert,
    }) => {
      const foreignOpen = await openCase('AjenoAbierto', {}, unitB)
      const foreignClosed = await openCase(
        'AjenoCerrado',
        { status: EMPLOYEE_OFFBOARDING_STATUS.CLOSED },
        unitB
      )
      const foreignCancelled = await openCase(
        'AjenoCancelado',
        { status: EMPLOYEE_OFFBOARDING_STATUS.CANCELLED },
        unitB
      )
      const bodies: Array<Record<string, unknown>> = []
      for (const target of [foreignOpen, foreignClosed, foreignCancelled]) {
        const response = await edit(client, target.employeeOffboardingId, VALID_EDIT)
        assertRejected(response, 404, NOT_FOUND)
        bodies.push(response.body())
        await assertUntouched(assert, target.employeeOffboardingId)
      }
      const missing = await edit(client, 999_999_999, VALID_EDIT)
      assertRejected(missing, 404, NOT_FOUND)
      for (const body of bodies) assert.deepEqual(body, missing.body())
    })

    test('CA10: las llaves no declaradas del cuerpo se ignoran', async ({ client, assert }) => {
      const offboarding = await openCase('Extra')
      const response = await edit(client, offboarding.employeeOffboardingId, {
        ...VALID_EDIT,
        employeeOffboardingStatus: EMPLOYEE_OFFBOARDING_STATUS.CLOSED,
        employeeId: 1,
        employeeOffboardingOrigin: EMPLOYEE_OFFBOARDING_ORIGIN.TERMINATION,
        terminationDate: '2026-01-01',
        employeeOffboardingTerminationModality: 'Despido',
      })
      response.assertStatus(200)
      const row = await caseRow(offboarding.employeeOffboardingId)
      assert.equal(row!.employee_offboarding_status, EMPLOYEE_OFFBOARDING_STATUS.OPEN)
      assert.equal(row!.business_unit_id, unitA.businessUnitId)
      assert.equal(row!.employee_id, fixtures[fixtures.length - 1].employee.employeeId)
      assert.equal(row!.employee_offboarding_origin, EMPLOYEE_OFFBOARDING_ORIGIN.SCHEDULED)
      assert.isNull(row!.employee_offboarding_termination_date)
      assert.isNull(row!.employee_offboarding_termination_modality)
    })
  }
)

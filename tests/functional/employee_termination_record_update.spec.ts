import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import EmployeeQuotaService from '#services/employee_quota_service'
import EmployeeService from '#services/employee_service'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1792172889566 — el guardado de la ficha (`PUT /api/employees/:id`) ya
 * no pone, cambia ni vacía la baja de un colaborador activo (CA1 a CA11).
 * Llave ausente conserva; igual se ignora; activo que toca el trío → 400 antes
 * del permiso; dado de baja se corrige como hoy pero no se vacía; el estado se
 * decide con la fila bloqueada. Afirma solo sobre filas propias.
 */

const TEST_PASSWORD = 'BajaSoloExpediente123!'
const EMPLOYEES_MODULE_SLUG = 'employees'
const RECORDED = { date: '2024-01-15', modality: 'Renuncia', type: 'Jubilación' }
const ACTIVE_FORBIDDEN = {
  key: 'baja-solo-desde-el-expediente',
  code: 'EMP.TERMINATION.ACTIVE_CHANGE_FORBIDDEN',
}
const CLEAR_FORBIDDEN = {
  key: 'la-baja-no-se-puede-quitar-desde-la-ficha',
  code: 'EMP.TERMINATION.CLEAR_FORBIDDEN',
}
const INVALID_DATE_KEY = 'fecha-de-baja-invalida'

function asFixture<T>(build: () => Promise<T>): Promise<T> {
  return TenantContext.runUnscoped(build, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
}

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Baja ficha ${label} ${s}`,
    businessUnitSlug: `baja-ficha-${label}-${s}`,
    businessUnitLegalName: `Baja ficha ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

interface EmployeeFixture {
  employee: Employee
  person: Person
}

interface TerminationSeed {
  date: string
  modality: string
  type: string
}

/** Colaborador; con `termination` el trío asentado y, con `deleted`, dado de baja en BD. */
async function createEmployee(
  unit: BusinessUnit,
  label: string,
  options: { termination?: TerminationSeed | null; deleted?: boolean } = {}
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Ficha',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `baja-ficha-${label.toLowerCase()}-${s}@gsti-tests.local`,
    businessUnitId: unit.businessUnitId,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `BFI-${s}`
  employee.employeeFirstName = 'Ficha'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `BFI-${s}`
  employee.employeeBusinessEmail = person.personEmail!
  employee.companyId = unit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.employeeTypeId = 1
  employee.departmentId = null
  employee.positionId = null
  employee.employeeTerminatedDate = null
  await employee.save()
  const patch: Record<string, unknown> = {}
  if (options.termination) {
    patch.employee_terminated_date = `${options.termination.date} 00:00:00`
    patch.employee_termination_modality = options.termination.modality
    patch.employee_termination_type = options.termination.type
  }
  if (options.deleted) {
    patch.employee_deleted_at = new Date()
  }
  if (Object.keys(patch).length > 0) {
    await db.from('employees').where('employee_id', employee.employeeId).update(patch)
  }
  return { employee, person }
}

/** Fila completa del colaborador: la comparación "intacta" es sobre todas las columnas. */
async function employeeRow(employeeId: number) {
  return db.from('employees').where('employee_id', employeeId).first()
}

/** El trío tal como está escrito, para comparar byte a byte. */
async function terminationRow(employeeId: number) {
  return db
    .from('employees')
    .where('employee_id', employeeId)
    .select(
      'employee_deleted_at',
      'employee_termination_modality',
      'employee_termination_type',
      db.raw("DATE_FORMAT(employee_terminated_date, '%Y-%m-%d %H:%i:%s') AS terminated_date")
    )
    .first()
}

interface Actor {
  user: User
  person: Person
  role: Role | null
}

async function createRootActor(units: BusinessUnit[]): Promise<Actor> {
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()
  return createActor(role, units, false)
}

async function createTenantActor(unit: BusinessUnit, permissionSlugs: string[]): Promise<Actor> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Baja ficha ${s}`,
    roleSlug: `baja-ficha-${s}`,
    roleDescription: 'Rol temporal del spec del registro de baja en la ficha',
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
          .where('system_module_slug', EMPLOYEES_MODULE_SLUG)
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
  const email = `baja-ficha-actor-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'Ficha',
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

function bodyFor(fixture: EmployeeFixture, overrides: Record<string, unknown> = {}) {
  const employee = fixture.employee
  return {
    employeeCode: String(employee.employeeCode),
    employeeFirstName: employee.employeeFirstName ?? '',
    employeeLastName: employee.employeeLastName ?? '',
    employeeSecondLastName: employee.employeeSecondLastName ?? '',
    companyId: employee.companyId,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    employeeTypeId: employee.employeeTypeId,
    businessUnitId: employee.businessUnitId,
    payrollBusinessUnitId: employee.payrollBusinessUnitId,
    employeeBusinessEmail: employee.employeeBusinessEmail,
    employeeWorkSchedule: 'Onsite',
    employeeWorkScheduleHybridConfig: null,
    ...overrides,
  }
}

async function destroyFixtures(
  fixtures: EmployeeFixture[],
  actors: Actor[],
  units: BusinessUnit[]
): Promise<void> {
  const employeeIds = fixtures.map((fixture) => fixture.employee.employeeId)
  if (employeeIds.length > 0) {
    await db.from('employee_offboardings').whereIn('employee_id', employeeIds).delete()
    await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
    await db.from('employees').whereIn('employee_id', employeeIds).delete()
    await db
      .from('people')
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
    await db.from('people').where('person_id', actor.person.personId).delete()
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
  'Registro de baja desde la ficha — PUT /api/employees/:id (VLRH-H1792172889566)',
  (group) => {
    let unit: BusinessUnit
    let foreignUnit: BusinessUnit
    let root: Actor
    let editor: Actor
    let employeesModule: SystemModule
    let enforcementBefore: boolean
    const fixtures: EmployeeFixture[] = []
    const actors: Actor[] = []
    const quota = new EmployeeQuotaService()

    const track = async (
      label: string,
      options: { termination?: TerminationSeed | null; deleted?: boolean } = {},
      target: BusinessUnit = unit
    ): Promise<EmployeeFixture> => {
      const fixture = await asFixture(() => createEmployee(target, label, options))
      fixtures.push(fixture)
      return fixture
    }

    const put = (
      client: ApiClient,
      actor: Actor,
      fixture: EmployeeFixture,
      overrides: Record<string, unknown>,
      locale?: string
    ) => {
      const request = client
        .put(`/api/employees/${fixture.employee.employeeId}`)
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', unit.businessUnitPublicId)
        .json(bodyFor(fixture, overrides))
      return locale ? request.header('Accept-Language', locale) : request
    }

    const trio = (date: unknown, modality = RECORDED.modality, type = RECORDED.type) => ({
      employeeTerminatedDate: date,
      employeeTerminationModality: modality,
      employeeTerminationType: type,
    })

    const assertTerminationError = (
      assert: Assert,
      response: ApiResponse,
      expected: { key: string; code: string }
    ) => {
      response.assertStatus(400)
      const body = response.body()
      assert.equal(body.type, 'warning')
      assert.equal(body.key, expected.key)
      assert.equal(body.code, expected.code)
      assert.isString(body.title)
      assert.isString(body.detail)
      assert.equal(body.message, body.detail)
      assert.notProperty(body, 'data')
      assert.notProperty(body, 'error')
    }

    const activeCount = () => quota.countActiveEmployees(unit.businessUnitId)

    group.setup(async () => {
      employeesModule = await SystemModule.query()
        .whereNull('system_module_deleted_at')
        .where('system_module_slug', EMPLOYEES_MODULE_SLUG)
        .firstOrFail()
      enforcementBefore = Boolean(employeesModule.systemModulePermissionEnforcementActive)
      employeesModule.systemModulePermissionEnforcementActive = true
      await employeesModule.save()

      await asFixture(async () => {
        unit = await createUnit('empresa')
        foreignUnit = await createUnit('ajena')
        root = await createRootActor([unit, foreignUnit])
        editor = await createTenantActor(unit, ['tab-trabajo-write'])
        actors.push(root, editor)
      })
    })

    group.teardown(async () => {
      try {
        await asFixture(() => destroyFixtures(fixtures, actors, [unit, foreignUnit]))
      } finally {
        employeesModule.systemModulePermissionEnforcementActive = enforcementBefore
        await employeesModule.save()
      }
    })

    test('CA1: sin ninguna llave del trío la baja guardada no se toca, en activo y en dado de baja', async ({
      client,
      assert,
    }) => {
      const act1 = await track('Act1Ausente', { termination: RECORDED })
      const baj = await track('BajAusente', { termination: RECORDED, deleted: true })
      const countBefore = await activeCount()

      const act1Before = await terminationRow(act1.employee.employeeId)
      const act1Response = await put(client, root, act1, { dailySalary: 999 })
      act1Response.assertStatus(201)
      const act1Row = await employeeRow(act1.employee.employeeId)
      assert.equal(Number(act1Row.daily_salary), 999)
      assert.deepEqual(await terminationRow(act1.employee.employeeId), act1Before)
      assert.equal(act1Before.terminated_date, `${RECORDED.date} 00:00:00`)

      // En un dado de baja el historial de salario no resuelve su empresa
      // (preexistente, fuera de esta HU): el cambio inocuo es otro campo
      const bajBefore = await terminationRow(baj.employee.employeeId)
      const payrollNum = `BFI-CA1-${Date.now()}`
      const bajResponse = await put(client, root, baj, { employeePayrollNum: payrollNum })
      bajResponse.assertStatus(201)
      const bajRow = await employeeRow(baj.employee.employeeId)
      assert.equal(bajRow.employee_payroll_num, payrollNum)
      assert.deepEqual(await terminationRow(baj.employee.employeeId), bajBefore)
      assert.equal(bajBefore.terminated_date, `${RECORDED.date} 00:00:00`)

      assert.equal(await activeCount(), countBefore)
    })

    test('CA2: el trío igual a lo guardado se ignora sin exigir el permiso ni reescribir', async ({
      client,
      assert,
    }) => {
      const act1 = await track('Act1Igual', { termination: RECORDED })
      const before = await terminationRow(act1.employee.employeeId)
      const response = await put(client, editor, act1, {
        employeeTerminatedDate: '2024-01-15T06:00:00.000Z',
        employeeTerminationModality: ' Renuncia ',
      })
      response.assertStatus(201)
      assert.deepEqual(await terminationRow(act1.employee.employeeId), before)
    })

    test('CA3: poner o cambiar la baja de un activo responde 400 y no guarda nada', async ({
      client,
      assert,
    }) => {
      const act0 = await track('Act0Poner')
      const act1 = await track('Act1Cambiar', { termination: RECORDED })
      const countBefore = await activeCount()
      const attempts: Array<[EmployeeFixture, Record<string, unknown>]> = [
        [act0, trio(RECORDED.date)],
        [act1, trio('2024-02-15')],
        [act1, { employeeTerminationModality: 'Retiro' }],
      ]
      for (const [fixture, changes] of attempts) {
        const before = await employeeRow(fixture.employee.employeeId)
        const response = await put(client, root, fixture, { dailySalary: 999, ...changes })
        assertTerminationError(assert, response, ACTIVE_FORBIDDEN)
        assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
      }
      assert.equal(await activeCount(), countBefore)
    })

    test('CA4: vaciar la fecha de un activo con baja antigua responde el mismo 400', async ({
      client,
      assert,
    }) => {
      const act1 = await track('Act1Vaciar', { termination: RECORDED })
      const before = await employeeRow(act1.employee.employeeId)
      const countBefore = await activeCount()
      for (const value of [null, '', '   ']) {
        const response = await put(client, root, act1, { employeeTerminatedDate: value })
        assertTerminationError(assert, response, ACTIVE_FORBIDDEN)
        assert.deepEqual(await employeeRow(act1.employee.employeeId), before)
      }
      assert.equal(await activeCount(), countBefore)
    })

    test('CA5: el rechazo del activo no depende del permiso: sin employees:delete es 400, nunca 403', async ({
      client,
      assert,
    }) => {
      const act1 = await track('Act1SinPermiso', { termination: RECORDED })
      const before = await employeeRow(act1.employee.employeeId)
      assertTerminationError(
        assert,
        await put(client, editor, act1, trio('2024-02-15')),
        ACTIVE_FORBIDDEN
      )
      assertTerminationError(
        assert,
        await put(client, editor, act1, { employeeTerminatedDate: null }),
        ACTIVE_FORBIDDEN
      )
      assert.deepEqual(await employeeRow(act1.employee.employeeId), before)
    })

    test('CA6: la baja de un dado de baja se corrige con employees:delete; sin él 403; fuera de catálogo 400 legacy', async ({
      client,
      assert,
    }) => {
      const baj = await track('BajCorregir', { termination: RECORDED, deleted: true })
      const countBefore = await activeCount()
      const bajBefore = await terminationRow(baj.employee.employeeId)
      const deletedAtBefore = bajBefore.employee_deleted_at

      const corrected = await put(client, root, baj, trio('2024-02-15T06:00:00.000Z'))
      corrected.assertStatus(201)
      const after = await terminationRow(baj.employee.employeeId)
      assert.equal(after.terminated_date, '2024-02-15 00:00:00')
      assert.equal(String(after.employee_deleted_at), String(deletedAtBefore))
      assert.equal(await activeCount(), countBefore)

      const before = await employeeRow(baj.employee.employeeId)
      const denied = await put(client, editor, baj, trio('2024-03-15'))
      denied.assertStatus(403)
      assert.equal(denied.body().key, 'PERM.DENIED')
      assert.deepEqual(await employeeRow(baj.employee.employeeId), before)

      const offCatalog = await put(client, root, baj, trio('2024-03-15', 'Modalidad inventada'))
      offCatalog.assertStatus(400)
      assert.equal(offCatalog.body().title, 'Modalidad de baja no válida')
      assert.notProperty(offCatalog.body(), 'code')
      assert.deepEqual(await employeeRow(baj.employee.employeeId), before)
    })

    test('CA7: un dado de baja no se queda sin fecha de baja', async ({ client, assert }) => {
      const baj = await track('BajVaciar', { termination: RECORDED, deleted: true })
      const before = await employeeRow(baj.employee.employeeId)
      const response = await put(client, root, baj, { employeeTerminatedDate: null })
      assertTerminationError(assert, response, CLEAR_FORBIDDEN)
      assert.deepEqual(await employeeRow(baj.employee.employeeId), before)
    })

    test('CA8: el estado se decide con la fila bloqueada: reactivado a medio guardado, la corrección se rechaza', async ({
      client,
      assert,
      cleanup,
    }) => {
      const baj = await track('BajCarrera', { termination: RECORDED, deleted: true })
      const employeeId = baj.employee.employeeId
      const original = EmployeeService.prototype.verifyInfoExist
      cleanup(() => {
        EmployeeService.prototype.verifyInfoExist = original
      })
      let fired = false
      // Entre la lectura del PUT y su transacción, el colaborador se reactiva
      EmployeeService.prototype.verifyInfoExist = async function (employee) {
        if (!fired) {
          fired = true
          await db.from('employees').where('employee_id', employeeId).update({
            employee_deleted_at: null,
            employee_terminated_date: null,
            employee_termination_modality: null,
            employee_termination_type: null,
          })
        }
        return original.call(this, employee)
      }

      const response = await put(client, root, baj, trio('2024-02-15'))
      assert.isTrue(fired)
      assertTerminationError(assert, response, ACTIVE_FORBIDDEN)
      const row = await terminationRow(employeeId)
      assert.isNull(row.employee_deleted_at)
      assert.isNull(row.terminated_date)
      assert.isNull(row.employee_termination_modality)
    })

    test('CA9: con Accept-Language en, título y detalle salen en inglés y la key sigue en español', async ({
      client,
      assert,
    }) => {
      const act0 = await track('Act0Idioma')
      const active = await put(client, root, act0, trio(RECORDED.date), 'en')
      assertTerminationError(assert, active, ACTIVE_FORBIDDEN)
      assert.equal(active.body().title, 'Termination only from the offboarding file')
      assert.include(active.body().detail, 'Offboarding file')

      const baj = await track('BajIdioma', { termination: RECORDED, deleted: true })
      const clear = await put(client, root, baj, { employeeTerminatedDate: null }, 'en')
      assertTerminationError(assert, clear, CLEAR_FORBIDDEN)
      assert.equal(clear.body().title, 'The termination cannot be removed from the profile')
      assert.include(clear.body().detail, 'Reactivate')
    })

    test('CA10: el colaborador de otra empresa responde el 404 vigente y nada cambia', async ({
      client,
      assert,
    }) => {
      const ext = await track('Ext', { termination: RECORDED }, foreignUnit)
      const before = await employeeRow(ext.employee.employeeId)
      for (const changes of [trio('2024-02-15'), { employeeTerminatedDate: null }]) {
        const response = await put(client, root, ext, changes)
        response.assertStatus(404)
        assert.deepEqual(await employeeRow(ext.employee.employeeId), before)
      }
    })

    test('CA11: la fecha no interpretable responde 400 fecha-de-baja-invalida antes de cualquier otra rama', async ({
      client,
      assert,
    }) => {
      const act1 = await track('Act1Invalida', { termination: RECORDED })
      const baj = await track('BajInvalida', { termination: RECORDED, deleted: true })
      for (const fixture of [act1, baj]) {
        for (const actor of [root, editor]) {
          const before = await employeeRow(fixture.employee.employeeId)
          const response = await put(client, actor, fixture, trio('2026-02-30'))
          response.assertStatus(400)
          assert.equal(response.body().key, INVALID_DATE_KEY)
          assert.notProperty(response.body(), 'code')
          assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
        }
      }
    })
  }
)

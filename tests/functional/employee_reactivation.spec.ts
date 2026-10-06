import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import EmployeeService from '#services/employee_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import OffboardingsService from '#modules/employee-offboarding/offboardings/offboardings.service'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { toCalendarIsoDate } from '#utils/business_date'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1790812613829 — reactivar es deshacer la baja: todo o nada, cupo
 * primero, código original, copia de los datos de baja en el expediente,
 * dentro de la empresa de la sesión. Punta a punta por HTTP; la baja se hace
 * por el `DELETE` real (abre el expediente en automático). Asserts sobre
 * filas propias, nunca conteos absolutos.
 */

const TEST_PASSWORD = 'DeshacerBaja123!'
const D = '2026-09-15'
const MODALITY = 'Renuncia'
const TERMINATION_TYPE = 'Cambio de Residencia'
const EMPLOYEES_MODULE_SLUG = 'employees'
const OFFBOARDINGS_TABLE = 'employee_offboardings'
const NOT_FOUND_BODY = {
  type: 'warning',
  title: 'The employee was not found',
  message: 'The employee was not found with the entered ID',
}

/** Fuera de una petición el filtro de empresa lanza: las fixtures se declaran como excepción de prueba. */
function asFixture<T>(build: () => Promise<T>): Promise<T> {
  return TenantContext.runUnscoped(build, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
}

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Deshacer baja ${label} ${s}`,
    businessUnitSlug: `deshacer-baja-${label}-${s}`,
    businessUnitLegalName: `Deshacer baja ${label} legal ${s}`,
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

/** Colaborador activo con el código dado; con `termination`, con registro de baja pero sin borrado lógico. */
async function createEmployee(
  unit: BusinessUnit,
  label: string,
  code: string,
  termination: TerminationSeed | null = null
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Reactivar',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `deshacer-baja-${label.toLowerCase()}-${s}@gsti-tests.local`,
    businessUnitId: unit.businessUnitId,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = code
  employee.employeeFirstName = 'Reactivar'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `DB-${s}`
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
  if (termination) {
    await db
      .from('employees')
      .where('employee_id', employee.employeeId)
      .update({
        employee_terminated_date: `${termination.date} 00:00:00`,
        employee_termination_modality: termination.modality,
        employee_termination_type: termination.type,
      })
  }
  return { employee, person }
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

/** Usuario de la empresa con SOLO los permisos indicados del módulo de empleados. */
async function createTenantActor(unit: BusinessUnit, permissionSlugs: string[]): Promise<Actor> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Deshacer baja ${s}`,
    roleSlug: `deshacer-baja-${s}`,
    roleDescription: 'Rol temporal del spec de la reactivación',
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
  const email = `deshacer-baja-actor-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'DeshacerBaja',
    personSecondLastname: s,
    personEmail: email,
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

/** Body equivalente al eco del BO para el `PUT` de la ficha. */
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

/** Fila del colaborador tal como está en BD (fecha de baja como `yyyy-MM-dd HH:mm:ss`). */
async function employeeRow(employeeId: number) {
  return db
    .from('employees')
    .where('employee_id', employeeId)
    .select(
      'employee_code',
      'employee_deleted_at',
      'employee_termination_modality',
      'employee_termination_type',
      db.raw("DATE_FORMAT(employee_terminated_date, '%Y-%m-%d %H:%i:%s') AS terminated_date")
    )
    .first()
}

/** Expedientes del colaborador con su copia de la baja. */
async function offboardingRows(employeeId: number) {
  return db
    .from(OFFBOARDINGS_TABLE)
    .where('employee_id', employeeId)
    .select(
      'employee_offboarding_id',
      'employee_offboarding_status',
      'employee_offboarding_termination_date',
      'employee_offboarding_termination_modality',
      'employee_offboarding_termination_type',
      db.raw("DATE_FORMAT(employee_offboarding_updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at")
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
    await db.from(OFFBOARDINGS_TABLE).whereIn('employee_id', employeeIds).delete()
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
  'Deshacer la baja — PUT /api/employees/:id/reactivate (VLRH-H1790812613829)',
  (group) => {
    let unit: BusinessUnit
    let foreignUnit: BusinessUnit
    let root: Actor
    const fixtures: EmployeeFixture[] = []
    const actors: Actor[] = []
    const quotaService = new EmployeeQuotaService()

    const track = async (build: () => Promise<EmployeeFixture>): Promise<EmployeeFixture> => {
      const fixture = await asFixture(build)
      fixtures.push(fixture)
      return fixture
    }

    /** Baja real por HTTP con D: abre el expediente en automático. */
    const terminate = async (
      client: ApiClient,
      fixture: EmployeeFixture,
      inUnit: BusinessUnit = unit
    ) => {
      const response = await client
        .delete(`/api/employees/${fixture.employee.employeeId}`)
        .loginAs(root.user)
        .header('X-Business-Unit-Id', inUnit.businessUnitPublicId)
        .json({
          employeeTerminatedDate: D,
          employeeTerminationModality: MODALITY,
          employeeTerminationType: TERMINATION_TYPE,
        })
      response.assertStatus(201)
    }

    const reactivate = (client: ApiClient, fixture: EmployeeFixture, actor: Actor = root) =>
      client
        .put(`/api/employees/${fixture.employee.employeeId}/reactivate`)
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', unit.businessUnitPublicId)
        .setup((request) => {
          request.request.ok(() => true)
        })

    /** Colaborador con el código dado, ya dado de baja por HTTP. */
    const terminatedEmployee = async (client: ApiClient, label: string, code: string) => {
      const fixture = await track(() => createEmployee(unit, label, code))
      await terminate(client, fixture)
      return fixture
    }

    group.setup(async () => {
      await asFixture(async () => {
        unit = await createUnit('empresa')
        foreignUnit = await createUnit('ajena')
        root = await createRootActor([unit, foreignUnit])
        actors.push(root)
      })
    })

    group.teardown(() => asFixture(() => destroyFixtures(fixtures, actors, [unit, foreignUnit])))

    test('CA-1 y CA-10: deshace la baja completa, copia los datos al expediente y responde solo id y código', async ({
      client,
      assert,
    }) => {
      const code = `A-120-${stamp()}`
      const fixture = await terminatedEmployee(client, 'Completa', code)
      const terminated = await employeeRow(fixture.employee.employeeId)
      assert.isNotNull(terminated.employee_deleted_at)
      assert.match(String(terminated.employee_code), /-IN\d+$/)
      const activeBefore = await quotaService.countActiveEmployees(unit.businessUnitId)

      const response = await reactivate(client, fixture)
      response.assertStatus(200)
      const body = response.body()
      assert.deepEqual(Object.keys(body.data.employee).sort(), ['employeeCode', 'employeeId'])
      assert.equal(body.data.employee.employeeId, fixture.employee.employeeId)
      assert.equal(body.data.employee.employeeCode, code)
      const serialized = JSON.stringify(body)
      assert.notInclude(serialized, 'person')
      assert.notInclude(serialized, MODALITY)
      assert.notInclude(serialized, D)

      const row = await employeeRow(fixture.employee.employeeId)
      assert.isNull(row.employee_deleted_at)
      assert.isNull(row.terminated_date)
      assert.isNull(row.employee_termination_modality)
      assert.isNull(row.employee_termination_type)
      assert.equal(row.employee_code, code)

      const [offboarding] = await offboardingRows(fixture.employee.employeeId)
      assert.equal(toCalendarIsoDate(offboarding.employee_offboarding_termination_date), D)
      assert.equal(offboarding.employee_offboarding_termination_modality, MODALITY)
      assert.equal(offboarding.employee_offboarding_termination_type, TERMINATION_TYPE)

      // Regla 6: vuelve a contar para el cupo
      assert.equal(await quotaService.countActiveEmployees(unit.businessUnitId), activeBefore + 1)
    })

    test('CA-2: un código con -IN interno recupera el original completo', async ({
      client,
      assert,
    }) => {
      const code = `MX-INV-7-${stamp()}`
      const fixture = await terminatedEmployee(client, 'Interno', code)
      const response = await reactivate(client, fixture)
      response.assertStatus(200)
      const reactivatedRow = await employeeRow(fixture.employee.employeeId)
      assert.equal(reactivatedRow.employee_code, code)
    })

    test('CA-3 y CA-4: sin lugar en el cupo o sin plan se rechaza con el error de cupo y nada cambia', async ({
      client,
      assert,
      cleanup,
    }) => {
      const fixture = await terminatedEmployee(client, 'Cupo', `CUPO-${stamp()}`)
      const before = await employeeRow(fixture.employee.employeeId)
      const [offboardingBefore] = await offboardingRows(fixture.employee.employeeId)
      const original = EmployeeQuotaService.prototype.resolveQuota
      cleanup(() => {
        EmployeeQuotaService.prototype.resolveQuota = original
      })

      // Cupo lleno, relativo al conteo real
      EmployeeQuotaService.prototype.resolveQuota = async function (businessUnitId, trx) {
        return { limit: await this.countActiveEmployees(businessUnitId, trx), source: 'legacy' }
      }
      const exceeded = await reactivate(client, fixture)
      exceeded.assertStatus(409)
      const exceededBody = exceeded.body()
      assert.equal(exceededBody.type, 'error')
      assert.equal(exceededBody.key, 'cupo-empleados-agotado')
      assert.equal(exceededBody.code, 'EMP.QUOTA.EXCEEDED')
      assert.isNumber(exceededBody.data.contracted)
      assert.isNumber(exceededBody.data.active)
      assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
      const [offboardingAfterExceeded] = await offboardingRows(fixture.employee.employeeId)
      assert.deepEqual(offboardingAfterExceeded, offboardingBefore)

      // Sin plan vigente
      EmployeeQuotaService.prototype.resolveQuota = async () => ({ limit: 0, source: 'no_plan' })
      const noPlan = await reactivate(client, fixture)
      noPlan.assertStatus(409)
      assert.equal(noPlan.body().key, 'sin-plan-contratado')
      assert.equal(noPlan.body().code, 'EMP.QUOTA.NO_PLAN')
      assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)

      // Con un lugar libre, el mismo colaborador se reactiva
      EmployeeQuotaService.prototype.resolveQuota = async function (businessUnitId, trx) {
        return {
          limit: (await this.countActiveEmployees(businessUnitId, trx)) + 1,
          source: 'legacy',
        }
      }
      const ok = await reactivate(client, fixture)
      ok.assertStatus(200)
      const reactivatedRow = await employeeRow(fixture.employee.employeeId)
      assert.isNull(reactivatedRow.employee_deleted_at)
    })

    test('CA-5: el código ocupado por otro colaborador vivo de la misma empresa rechaza sin identificarlo; en otra empresa no estorba', async ({
      client,
      assert,
    }) => {
      const code = `C-${stamp()}`
      const x = await terminatedEmployee(client, 'Ocupado', code)
      const before = await employeeRow(x.employee.employeeId)
      const y = await track(() => createEmployee(unit, 'Ocupante', code))

      const taken = await reactivate(client, x)
      taken.assertStatus(409)
      const body = taken.body()
      assert.equal(body.type, 'error')
      assert.equal(body.title, 'Código de colaborador ocupado')
      assert.equal(body.key, 'codigo-de-colaborador-ocupado')
      assert.equal(body.code, 'EMP.REACTIVATION.CODE_TAKEN')
      assert.deepEqual(body.data, { employeeCode: code })
      assert.include(body.message, code)
      assert.isNotEmpty(body.detail)
      const serialized = JSON.stringify(body)
      assert.notInclude(serialized, `"${y.employee.employeeId}"`)
      assert.notInclude(serialized, String(y.employee.employeePayrollNum))
      assert.notInclude(serialized, 'Ocupante')
      assert.deepEqual(await employeeRow(x.employee.employeeId), before)
      const [offboarding] = await offboardingRows(x.employee.employeeId)
      assert.isNull(offboarding.employee_offboarding_termination_date)
      assert.isNull(offboarding.employee_offboarding_termination_modality)

      // El mismo código en OTRA empresa no estorba
      await asFixture(async () => {
        await db.from('employees').where('employee_id', y.employee.employeeId).delete()
        await db.from('people').where('person_id', y.person.personId).delete()
      })
      fixtures.splice(fixtures.indexOf(y), 1)
      await track(() => createEmployee(foreignUnit, 'OcupanteAjeno', code))
      const ok = await reactivate(client, x)
      ok.assertStatus(200)
      const restoredRow = await employeeRow(x.employee.employeeId)
      assert.equal(restoredRow.employee_code, code)
    })

    test('CA-6: una falla dentro del hook revierte todo y responde un 500 sin detalle técnico', async ({
      client,
      assert,
      cleanup,
    }) => {
      const fixture = await terminatedEmployee(client, 'Rollback', `RB-${stamp()}`)
      const before = await employeeRow(fixture.employee.employeeId)
      const original = OffboardingsService.prototype.onEmployeeReactivated
      cleanup(() => {
        OffboardingsService.prototype.onEmployeeReactivated = original
      })
      OffboardingsService.prototype.onEmployeeReactivated = async function (trx, employee, actor) {
        await original.call(this, trx, employee, actor) // escribe la copia…
        throw new Error('fallo simulado sql employees') // …y luego falla
      }

      const response = await reactivate(client, fixture)
      response.assertStatus(500)
      assert.deepEqual(response.body(), {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
      })
      assert.notInclude(JSON.stringify(response.body()), 'fallo simulado')
      assert.deepEqual(await employeeRow(fixture.employee.employeeId), before)
      // Sin transacción la copia habría quedado escrita
      const [offboarding] = await offboardingRows(fixture.employee.employeeId)
      assert.isNull(offboarding.employee_offboarding_termination_date)
      assert.isNull(offboarding.employee_offboarding_termination_modality)
      assert.isNull(offboarding.employee_offboarding_termination_type)
    })

    test('CA-7: sin expediente abierto no hay copia, pero el hook corre igual una sola vez', async ({
      client,
      assert,
      cleanup,
    }) => {
      const fixture = await terminatedEmployee(client, 'SinExpediente', `SE-${stamp()}`)
      await db
        .from(OFFBOARDINGS_TABLE)
        .where('employee_id', fixture.employee.employeeId)
        .update({ employee_offboarding_deleted_at: new Date() })
      const [before] = await offboardingRows(fixture.employee.employeeId)
      const original = OffboardingsService.prototype.onEmployeeReactivated
      cleanup(() => {
        OffboardingsService.prototype.onEmployeeReactivated = original
      })
      let calls = 0
      OffboardingsService.prototype.onEmployeeReactivated = async function (trx, employee, actor) {
        calls += 1
        return original.call(this, trx, employee, actor)
      }

      const response = await reactivate(client, fixture)
      response.assertStatus(200)
      assert.equal(calls, 1)
      const row = await employeeRow(fixture.employee.employeeId)
      assert.isNull(row.employee_deleted_at)
      assert.isNull(row.terminated_date)
      assert.isNull(row.employee_termination_modality)
      const [after] = await offboardingRows(fixture.employee.employeeId)
      assert.deepEqual(after, before)
      assert.isNull(after.employee_offboarding_termination_date)
    })

    test('CA-8: la segunda reactivación responde 404 y una confirmación tardía no escribe nada', async ({
      client,
      assert,
    }) => {
      const fixture = await terminatedEmployee(client, 'Segunda', `SG-${stamp()}`)
      // Instancia leída mientras seguía dado de baja (ya pasó la lectura del controller)
      const stale = await TenantContext.run([unit.businessUnitId], () =>
        Employee.query()
          .withTrashed()
          .where('employee_id', fixture.employee.employeeId)
          .firstOrFail()
      )
      assert.isNotNull(stale.deletedAt)

      const first = await reactivate(client, fixture)
      first.assertStatus(200)
      const activeAfterFirst = await quotaService.countActiveEmployees(unit.businessUnitId)
      const [offboardingAfterFirst] = await offboardingRows(fixture.employee.employeeId)

      const second = await reactivate(client, fixture)
      second.assertStatus(404)
      assert.deepEqual(second.body(), {
        ...NOT_FOUND_BODY,
        data: { employeeId: String(fixture.employee.employeeId) },
      })

      const outcome = await TenantContext.run([unit.businessUnitId], () =>
        new EmployeeService(i18nManager.locale(i18nManager.defaultLocale)).reactivate(stale, null)
      )
      assert.deepEqual(outcome, { kind: 'not-terminated' })
      assert.equal(await quotaService.countActiveEmployees(unit.businessUnitId), activeAfterFirst)
      const [offboardingAfterStale] = await offboardingRows(fixture.employee.employeeId)
      assert.deepEqual(offboardingAfterStale, offboardingAfterFirst)
    })

    test('CA-9: un colaborador dado de baja de otra empresa responde 404 y no cambia', async ({
      client,
      assert,
    }) => {
      const foreign = await track(() => createEmployee(foreignUnit, 'Ajeno', `AJ-${stamp()}`))
      await terminate(client, foreign, foreignUnit)
      const before = await employeeRow(foreign.employee.employeeId)

      // Cabecera de la empresa propia, colaborador de la ajena
      const response = await reactivate(client, foreign)
      response.assertStatus(404)
      assert.deepEqual(response.body(), {
        ...NOT_FOUND_BODY,
        data: { employeeId: String(foreign.employee.employeeId) },
      })
      assert.deepEqual(await employeeRow(foreign.employee.employeeId), before)
    })

    test('CA-13: el permiso de reactivar no relaja el PUT de la ficha, y sí basta para reactivar', async ({
      client,
      assert,
    }) => {
      const employeesModule = await SystemModule.query()
        .whereNull('system_module_deleted_at')
        .where('system_module_slug', EMPLOYEES_MODULE_SLUG)
        .firstOrFail()
      const originalEnforcement = employeesModule.systemModulePermissionEnforcementActive
      employeesModule.systemModulePermissionEnforcementActive = true
      await employeesModule.save()
      try {
        const actor = await asFixture(() =>
          createTenantActor(unit, ['tab-trabajo-write', 'reactivate-employees'])
        )
        actors.push(actor)

        // Colaborador ACTIVO con fecha de baja programada: quitarla desde la ficha sigue exigiendo delete
        const scheduled = await track(() =>
          createEmployee(unit, 'Programada', `PR-${stamp()}`, {
            date: '2026-12-31',
            modality: MODALITY,
            type: TERMINATION_TYPE,
          })
        )
        const before = await employeeRow(scheduled.employee.employeeId)
        const denied = await client
          .put(`/api/employees/${scheduled.employee.employeeId}`)
          .loginAs(actor.user)
          .header('X-Business-Unit-Id', unit.businessUnitPublicId)
          .json(
            bodyFor(scheduled, {
              employeeTerminatedDate: null,
              employeeTerminationModality: null,
              employeeTerminationType: null,
            })
          )
        denied.assertStatus(403)
        assert.equal(denied.body().key, 'PERM.DENIED')
        assert.deepEqual(await employeeRow(scheduled.employee.employeeId), before)

        // Con el mismo rol, reactivar a otro colaborador dado de baja sí pasa
        const terminated = await terminatedEmployee(client, 'ConPermiso', `CP-${stamp()}`)
        const ok = await reactivate(client, terminated, actor)
        ok.assertStatus(200)
        const reactivatedRow = await employeeRow(terminated.employee.employeeId)
        assert.isNull(reactivatedRow.employee_deleted_at)
      } finally {
        employeesModule.systemModulePermissionEnforcementActive = originalEnforcement
        await employeesModule.save()
      }
    })
  }
)

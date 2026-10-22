import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription from '#models/billing_subscription'
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
import OffboardingsRepositoryMysql from '#modules/employee-offboarding/offboardings/offboardings.repository.mysql'
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
const OPEN_CASE = { key: 'baja-programada-en-el-expediente', code: 'EMP.TERMINATION.OPEN_CASE' }
const QUOTA_EXCEEDED = { key: 'cupo-empleados-agotado', code: 'EMP.QUOTA.EXCEEDED' }
const QUOTA_NO_PLAN = { key: 'sin-plan-contratado', code: 'EMP.QUOTA.NO_PLAN' }

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
    /** Segunda empresa en el alcance de root (CA7 de la válvula). */
    let unitA2: BusinessUnit
    let root: Actor
    let editor: Actor
    /** Edita y da de baja: el que puede quitar la baja antigua (VLRH-H1792361735984). */
    let deleter: Actor
    /**
     * Suscripción viva de A: el candado de cupo (`assertWithinQuota`) serializa
     * con `FOR UPDATE` sobre esta fila como PRIMERA sentencia de la trx. Sin
     * ella, el camino legacy lee la empresa antes de bloquear y el snapshot RR
     * deja pasar dos válvulas simultáneas (hallazgo preexistente, afecta a Reactivar).
     */
    let billingRows: { planId: number; priceId: number; subscriptionId: number } | null = null
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
        unitA2 = await createUnit('segunda')
        root = await createRootActor([unit, foreignUnit, unitA2])
        editor = await createTenantActor(unit, ['tab-trabajo-write'])
        deleter = await createTenantActor(unit, ['tab-trabajo-write', 'delete'])
        actors.push(root, editor, deleter)

        const plan = await BillingPlan.create({
          billingPlanName: `Plan baja ficha ${stamp()}`,
          billingPlanDescription: 'fixture VLRH-H1792361735984',
        })
        const price = await BillingPlanPrice.create({
          billingPlanId: plan.billingPlanId,
          billingPlanPriceAmount: 79,
          billingPlanPriceCurrency: 'MXN',
          billingPlanPriceTaxRate: 0.16,
          billingPlanPriceTrialDays: 0,
          billingPlanPriceEffectiveFrom: '2025-01-01',
          billingPlanPriceStripePriceId: null,
          billingPlanPriceProvider: 'manual',
        })
        const now = DateTime.now()
        const subscription = await BillingSubscription.create({
          businessUnitId: unit.businessUnitId,
          billingPlanId: plan.billingPlanId,
          billingPlanPriceId: price.billingPlanPriceId,
          billingSubscriptionProvider: 'manual',
          billingSubscriptionStatus: 'active',
          billingSubscriptionContractedUnitAmount: 79,
          billingSubscriptionContractedEmployees: 500,
          billingSubscriptionDiscountPercent: 0,
          billingSubscriptionContractedTrialDays: 0,
          billingSubscriptionContractedCurrency: 'MXN',
          billingSubscriptionContractedTaxRate: 0.16,
          billingSubscriptionContractedSubtotal: 790,
          billingSubscriptionContractedTaxAmount: 126.4,
          billingSubscriptionContractedTotal: 916.4,
          billingSubscriptionCreditBalanceCents: 0,
          billingSubscriptionContractedEffectiveFrom: now,
          billingSubscriptionSubscribedAt: now,
        })
        billingRows = {
          planId: plan.billingPlanId,
          priceId: price.billingPlanPriceId,
          subscriptionId: subscription.billingSubscriptionId,
        }
      })
    })

    group.teardown(async () => {
      try {
        if (billingRows) {
          await db
            .from('billing_subscriptions')
            .where('billing_subscription_id', billingRows.subscriptionId)
            .delete()
          await db
            .from('billing_plan_prices')
            .where('billing_plan_price_id', billingRows.priceId)
            .delete()
          await db.from('billing_plans').where('billing_plan_id', billingRows.planId).delete()
        }
        await asFixture(() => destroyFixtures(fixtures, actors, [unit, foreignUnit, unitA2]))
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

    test('CA4: vaciar la fecha de un activo con baja antigua pasa a la válvula: con cupo, 201 y el trío en NULL (VLRH-H1792361735984)', async ({
      client,
      assert,
    }) => {
      const act1 = await track('Act1Vaciar', { termination: RECORDED })
      const countBefore = await activeCount()
      const response = await put(client, root, act1, { employeeTerminatedDate: null })
      response.assertStatus(201)
      const row = await terminationRow(act1.employee.employeeId)
      assert.isNull(row.terminated_date)
      assert.isNull(row.employee_termination_modality)
      assert.isNull(row.employee_termination_type)
      assert.isNull(row.employee_deleted_at)
      assert.equal(await activeCount(), countBefore + 1)
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
      // Vaciar la fecha es la válvula (VLRH-H1792361735984): sin employees:delete, 403 del gate
      const denied = await put(client, editor, act1, { employeeTerminatedDate: null })
      denied.assertStatus(403)
      assert.equal(denied.body().key, 'PERM.DENIED')
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
    // ------------------------------------------------------------------
    // Válvula de la baja antigua (VLRH-H1792361735984): fecha presente y vacía
    // sobre un activo con fecha guardada, con employees:delete, cupo en la
    // empresa resultante y sin expediente en curso.
    // ------------------------------------------------------------------

    /** Cupo fijado relativo al conteo real de cada empresa; `extra` por empresa. */
    const withQuota = (
      cleanup: (fn: () => void) => void,
      extraByUnit: (businessUnitId: number) => number | 'no_plan'
    ) => {
      const original = EmployeeQuotaService.prototype.resolveQuota
      cleanup(() => {
        EmployeeQuotaService.prototype.resolveQuota = original
      })
      EmployeeQuotaService.prototype.resolveQuota = async function (businessUnitId, trx) {
        const extra = extraByUnit(businessUnitId)
        if (extra === 'no_plan') return { limit: 0, source: 'no_plan' }
        return {
          limit: (await this.countActiveEmployees(businessUnitId, trx)) + extra,
          source: 'legacy',
        }
      }
    }

    const insertOpenCase = async (employeeId: number, status = 'open'): Promise<number> => {
      const [id] = await db.table('employee_offboardings').insert({
        employee_id: employeeId,
        business_unit_id: unit.businessUnitId,
        employee_offboarding_planned_date: RECORDED.date,
        employee_offboarding_status: status,
        employee_offboarding_origin: 'scheduled',
        employee_offboarding_cancelled_at: status === 'cancelled' ? new Date() : null,
        employee_offboarding_created_at: new Date(),
      })
      return Number(id)
    }

    const clear = (
      client: ApiClient,
      actor: Actor,
      fixture: EmployeeFixture,
      value: unknown = null
    ) => put(client, actor, fixture, { employeeTerminatedDate: value })

    test('V-CA1: con cupo, deleter quita fecha, modalidad y tipo; el conteo sube en 1', async ({
      client,
      assert,
      cleanup,
    }) => {
      withQuota(cleanup, () => 5)
      for (const value of [null, '']) {
        const act1 = await track(`Act1Valvula${value === null ? 'Null' : 'Vacia'}`, {
          termination: RECORDED,
        })
        const countBefore = await activeCount()
        const response = await clear(client, deleter, act1, value)
        response.assertStatus(201)
        const row = await terminationRow(act1.employee.employeeId)
        assert.isNull(row.terminated_date)
        assert.isNull(row.employee_termination_modality)
        assert.isNull(row.employee_termination_type)
        assert.isNull(row.employee_deleted_at)
        assert.equal(await activeCount(), countBefore + 1)
      }
    })

    test('V-CA2: ida y vuelta del show: solo cambia el trío', async ({
      client,
      assert,
      cleanup,
    }) => {
      withQuota(cleanup, () => 5)
      const act1 = await track('Act1Show', { termination: RECORDED })
      const shown = await client
        .get(`/api/employees/${act1.employee.employeeId}`)
        .loginAs(root.user)
        .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      shown.assertStatus(200)
      const before = await employeeRow(act1.employee.employeeId)
      const body = {
        ...shown.body().data.employee,
        employeeTerminatedDate: null,
        employeeTerminationModality: null,
        employeeTerminationType: null,
      }
      const response = await client
        .put(`/api/employees/${act1.employee.employeeId}`)
        .loginAs(root.user)
        .header('X-Business-Unit-Id', unit.businessUnitPublicId)
        .json(body)
      response.assertStatus(201)
      const after = await employeeRow(act1.employee.employeeId)
      const ignore = new Set([
        'employee_terminated_date',
        'employee_termination_modality',
        'employee_termination_type',
        'employee_updated_at',
      ])
      for (const column of Object.keys(before)) {
        if (ignore.has(column)) continue
        assert.deepEqual(after[column], before[column], column)
      }
      assert.isNull(after.employee_terminated_date)
      assert.isNull(after.employee_termination_modality)
      assert.isNull(after.employee_termination_type)
    })

    test('V-CA3: sin employees:delete es 403 y el cupo no se consulta', async ({
      client,
      assert,
      cleanup,
    }) => {
      const act1 = await track('Act1SinDelete', { termination: RECORDED })
      const before = await employeeRow(act1.employee.employeeId)
      const original = EmployeeQuotaService.prototype.assertWithinQuota
      let quotaCalls = 0
      cleanup(() => {
        EmployeeQuotaService.prototype.assertWithinQuota = original
      })
      EmployeeQuotaService.prototype.assertWithinQuota = async function (...args) {
        quotaCalls += 1
        return original.apply(this, args)
      }
      const response = await clear(client, editor, act1)
      response.assertStatus(403)
      assert.equal(response.body().key, 'PERM.DENIED')
      assert.equal(quotaCalls, 0)
      assert.deepEqual(await employeeRow(act1.employee.employeeId), before)
    })

    test('V-CA4 y V-CA12: con expediente en curso, 409 propio sin data; en inglés, key en español', async ({
      client,
      assert,
      cleanup,
    }) => {
      withQuota(cleanup, () => 5)
      const act1 = await track('Act1Expediente', { termination: RECORDED })
      const caseId = await insertOpenCase(act1.employee.employeeId)
      const before = await employeeRow(act1.employee.employeeId)
      const caseBefore = await db
        .from('employee_offboardings')
        .where('employee_offboarding_id', caseId)
        .first()
      const countBefore = await activeCount()

      const response = await clear(client, deleter, act1)
      response.assertStatus(409)
      const body = response.body()
      assert.equal(body.type, 'warning')
      assert.equal(body.key, OPEN_CASE.key)
      assert.equal(body.code, OPEN_CASE.code)
      assert.equal(body.message, body.detail)
      assert.notProperty(body, 'data')
      assert.notProperty(body, 'error')
      assert.deepEqual(await employeeRow(act1.employee.employeeId), before)
      assert.deepEqual(
        await db.from('employee_offboardings').where('employee_offboarding_id', caseId).first(),
        caseBefore
      )
      assert.equal(await activeCount(), countBefore)

      const english = await put(client, deleter, act1, { employeeTerminatedDate: null }, 'en')
      english.assertStatus(409)
      assert.equal(english.body().key, OPEN_CASE.key)
      assert.equal(english.body().title, 'Termination scheduled in the offboarding file')
      assert.include(english.body().detail, 'Offboarding file')
    })

    test('V-CA5: un expediente cancelado no bloquea la válvula (R8)', async ({
      client,
      assert,
      cleanup,
    }) => {
      withQuota(cleanup, () => 5)
      const act1 = await track('Act1Cancelado', { termination: RECORDED })
      await insertOpenCase(act1.employee.employeeId, 'cancelled')
      const response = await clear(client, deleter, act1)
      response.assertStatus(201)
      const cancelledRow = await terminationRow(act1.employee.employeeId)
      assert.isNull(cancelledRow.terminated_date)
    })

    test('V-CA6: sin cupo o sin plan, 409 con el sobre de cupo y fila intacta', async ({
      client,
      assert,
      cleanup,
    }) => {
      const act1 = await track('Act1SinCupo', { termination: RECORDED })
      const before = await employeeRow(act1.employee.employeeId)

      withQuota(cleanup, () => 0)
      const exceeded = await clear(client, deleter, act1)
      exceeded.assertStatus(409)
      assert.equal(exceeded.body().type, 'error')
      assert.equal(exceeded.body().key, QUOTA_EXCEEDED.key)
      assert.equal(exceeded.body().code, QUOTA_EXCEEDED.code)
      assert.notProperty(exceeded.body(), 'error')
      assert.deepEqual(await employeeRow(act1.employee.employeeId), before)

      withQuota(cleanup, () => 'no_plan')
      const noPlan = await clear(client, deleter, act1)
      noPlan.assertStatus(409)
      assert.equal(noPlan.body().key, QUOTA_NO_PLAN.key)
      assert.equal(noPlan.body().code, QUOTA_NO_PLAN.code)
      assert.deepEqual(await employeeRow(act1.employee.employeeId), before)
    })

    test('V-CA7: el cupo se revisa contra la empresa resultante', async ({
      client,
      assert,
      cleanup,
    }) => {
      const act1 = await track('Act1Mover', { termination: RECORDED })
      const before = await employeeRow(act1.employee.employeeId)
      const moveBody = {
        employeeTerminatedDate: null,
        businessUnitId: unitA2.businessUnitId,
        departmentId: null,
        positionId: null,
      }

      // A con cupo, A2 sin cupo: se rechaza por A2
      withQuota(cleanup, (bu) => (bu === unitA2.businessUnitId ? 0 : 5))
      const rejected = await put(client, root, act1, moveBody)
      rejected.assertStatus(409)
      assert.equal(rejected.body().code, QUOTA_EXCEEDED.code)
      assert.deepEqual(await employeeRow(act1.employee.employeeId), before)

      // A sin cupo, A2 con cupo: procede y el colaborador queda en A2
      const quotaService = new EmployeeQuotaService()
      const a2Before = await quotaService.countActiveEmployees(unitA2.businessUnitId)
      withQuota(cleanup, (bu) => (bu === unitA2.businessUnitId ? 5 : 0))
      const moved = await put(client, root, act1, moveBody)
      moved.assertStatus(201)
      const row = await employeeRow(act1.employee.employeeId)
      assert.equal(row.business_unit_id, unitA2.businessUnitId)
      assert.isNull(row.employee_terminated_date)
      assert.equal(await quotaService.countActiveEmployees(unitA2.businessUnitId), a2Before + 1)
    })

    test('V-CA8: estado al confirmar: dado de baja a medio guardado → 400; repetir no vuelve a sumar', async ({
      client,
      assert,
      cleanup,
    }) => {
      withQuota(cleanup, () => 5)
      const act1 = await track('Act1CarreraValvula', { termination: RECORDED })
      const employeeId = act1.employee.employeeId
      const original = EmployeeService.prototype.verifyInfoExist
      cleanup(() => {
        EmployeeService.prototype.verifyInfoExist = original
      })
      let fired = false
      EmployeeService.prototype.verifyInfoExist = async function (employee) {
        if (!fired) {
          fired = true
          await db
            .from('employees')
            .where('employee_id', employeeId)
            .update({ employee_deleted_at: new Date() })
        }
        return original.call(this, employee)
      }
      const raced = await clear(client, deleter, act1)
      assert.isTrue(fired)
      assertTerminationError(assert, raced, CLEAR_FORBIDDEN)
      const row = await terminationRow(employeeId)
      assert.equal(row.terminated_date, `${RECORDED.date} 00:00:00`)
      assert.isNotNull(row.employee_deleted_at)
      EmployeeService.prototype.verifyInfoExist = original

      // Reintento: el mismo cuerpo dos veces sobre otro activo suma exactamente 1
      const act2 = await track('Act2Repetir', { termination: RECORDED })
      const countBefore = await activeCount()
      const first = await clear(client, deleter, act2)
      first.assertStatus(201)
      const second = await clear(client, deleter, act2)
      assert.include([201, 409], second.status())
      const act2Row = await terminationRow(act2.employee.employeeId)
      assert.isNull(act2Row.terminated_date)
      assert.equal(await activeCount(), countBefore + 1)
    })

    test('V-CA9: dos válvulas simultáneas con un solo lugar: una 201 y otra 409, el conteo sube en 1', async ({
      client,
      assert,
      cleanup,
    }) => {
      const act1 = await track('Act1Simultanea', { termination: RECORDED })
      const act2 = await track('Act2Simultanea', { termination: RECORDED })
      const countBefore = await activeCount()
      // Un solo lugar libre, relativo al conteo real al momento de cada lectura
      withQuota(cleanup, () => 0)
      EmployeeQuotaService.prototype.resolveQuota = async () => ({
        limit: countBefore + 1,
        source: 'legacy',
      })
      const [first, second] = await Promise.all([
        clear(client, deleter, act1),
        clear(client, deleter, act2),
      ])
      const statuses = [first.status(), second.status()].sort()
      assert.deepEqual(statuses, [201, 409])
      const rejected = first.status() === 409 ? first : second
      assert.equal(rejected.body().code, QUOTA_EXCEEDED.code)
      assert.equal(await activeCount(), countBefore + 1)
    })

    test('V-CA10: orden de candados: cupo con la trx antes que el expediente con la misma trx', async ({
      client,
      assert,
      cleanup,
    }) => {
      withQuota(cleanup, () => 5)
      const act1 = await track('Act1Orden', { termination: RECORDED })
      const calls: Array<{ name: string; args: unknown[] }> = []
      const originalQuota = EmployeeQuotaService.prototype.assertWithinQuota
      const originalLock = OffboardingsRepositoryMysql.prototype.lockOpenByEmployee
      cleanup(() => {
        EmployeeQuotaService.prototype.assertWithinQuota = originalQuota
        OffboardingsRepositoryMysql.prototype.lockOpenByEmployee = originalLock
      })
      EmployeeQuotaService.prototype.assertWithinQuota = async function (...args) {
        calls.push({ name: 'quota', args })
        return originalQuota.apply(this, args)
      }
      OffboardingsRepositoryMysql.prototype.lockOpenByEmployee = async function (...args) {
        calls.push({ name: 'lockOpenByEmployee', args })
        return originalLock.apply(this, args)
      }
      const response = await clear(client, deleter, act1)
      response.assertStatus(201)
      const quotaCall = calls.find((call) => call.name === 'quota')
      const lockCall = calls.find((call) => call.name === 'lockOpenByEmployee')
      assert.exists(quotaCall)
      assert.exists(lockCall)
      assert.isBelow(calls.indexOf(quotaCall!), calls.indexOf(lockCall!))
      assert.equal(quotaCall!.args[0], unit.businessUnitId)
      assert.exists(quotaCall!.args[2], 'el cupo recibe la trx')
      assert.equal(lockCall!.args[0], act1.employee.employeeId)
      assert.strictEqual(lockCall!.args[1], quotaCall!.args[2], 'misma trx')
    })

    test('V-CA11: lo demás no cambia: ACT0 con fecha null sigue 201 sin escribir; BAJ con null sigue 400', async ({
      client,
      assert,
      cleanup,
    }) => {
      withQuota(cleanup, () => 5)
      const act0 = await track('Act0Valvula')
      const countBefore = await activeCount()
      const response = await clear(client, deleter, act0)
      response.assertStatus(201)
      const act0Row = await terminationRow(act0.employee.employeeId)
      assert.isNull(act0Row.terminated_date)
      assert.equal(await activeCount(), countBefore)

      const baj = await track('BajValvula', { termination: RECORDED, deleted: true })
      assertTerminationError(assert, await clear(client, deleter, baj), CLEAR_FORBIDDEN)
    })

    test('V-CA12: otra empresa responde el 404 vigente y el cupo no se consulta', async ({
      client,
      assert,
      cleanup,
    }) => {
      const ext = await track('ExtValvula', { termination: RECORDED }, foreignUnit)
      const original = EmployeeQuotaService.prototype.assertWithinQuota
      let quotaCalls = 0
      cleanup(() => {
        EmployeeQuotaService.prototype.assertWithinQuota = original
      })
      EmployeeQuotaService.prototype.assertWithinQuota = async function (...args) {
        quotaCalls += 1
        return original.apply(this, args)
      }
      const response = await clear(client, root, ext)
      response.assertStatus(404)
      assert.equal(quotaCalls, 0)
    })
  }
)

import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionChange, {
  LIVE_SUBSCRIPTION_CHANGE_STATUSES,
} from '#models/billing_subscription_change'
import Employee from '#models/employee'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'

/**
 * Tests funcionales — POST /api/billing/subscription/changes/decrease|cancel (USRH1786107870853).
 */

const TEST_PASSWORD = 'BillingChangeDecreaseTest123!'
const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function ensureOwnerRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'owner').first()
  if (!role) {
    throw new Error('Se requiere el rol owner en BD para probar decrease.')
  }
  return role
}

async function ensureEmployeeRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'empleado').first()
  if (!role) {
    throw new Error('Se requiere el rol empleado en BD para probar decrease.')
  }
  return role
}

async function createTenantActor(options: {
  emailPrefix: string
  roleSlug: 'owner' | 'empleado'
}): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${options.emailPrefix}-${stamp}@gsti-tests.local`
  const role =
    options.roleSlug === 'owner' ? await ensureOwnerRole() : await ensureEmployeeRole()

  const person = new Person()
  person.personFirstname = 'BillingDecrease'
  person.personLastname = 'Test'
  person.personSecondLastname = options.emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Billing Decrease ${stamp}`
  businessUnit.businessUnitSlug = `billing-decrease-${stamp}`
  businessUnit.businessUnitLegalName = `Billing Decrease Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Billing Decrease Plan ${stamp}`,
    billingPlanDescription: 'Fixture agendar reducción',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 51,
    billingVolumeTierDiscountPercent: 10,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createLiveSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  contractedEmployees: number,
  options?: { periodEndOffsetDays?: number; status?: BillingSubscription['billingSubscriptionStatus'] }
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees,
    skipTrial: true,
  })

  const today = toBusinessDateString()
  const endOffset = options?.periodEndOffsetDays ?? 20
  subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(today).minus({ days: 10 })
  subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(today).plus({
    days: endOffset,
  })
  if (options?.status) {
    subscription.billingSubscriptionStatus = options.status
  }
  await subscription.save()

  return subscription
}

async function seedActiveEmployees(businessUnitId: number, count: number): Promise<void> {
  const template = await Employee.query().whereNull('employee_deleted_at').firstOrFail()

  for (let i = 0; i < count; i++) {
    const person = new Person()
    person.personFirstname = 'Decrease'
    person.personLastname = 'Seed'
    person.personSecondLastname = `${i}`
    person.personEmail = `decrease-seed-${businessUnitId}-${i}-${STAMP}@gsti-tests.local`
    await person.save()

    const employee = new Employee()
    employee.personId = person.personId
    employee.businessUnitId = businessUnitId
    employee.companyId = template.companyId
    employee.departmentId = template.departmentId
    employee.positionId = template.positionId
    employee.employeeTypeId = template.employeeTypeId
    employee.employeeFirstName = 'Decrease'
    employee.employeeLastName = `Emp${i}`
    employee.employeeCode = `DEC-${businessUnitId}-${i}-${STAMP}`
    employee.employeePayrollNum = `DEC-${businessUnitId}-${i}`
    employee.employeeHireDate = DateTime.fromISO('2024-01-15')
    await employee.save()
  }
}

async function cleanupPlan(planId: number | null) {
  if (!planId) return
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

async function cleanupTenantActor(actor: TenantActor | null) {
  if (!actor) return
  await BillingSubscriptionChange.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
  await BillingSubscription.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
  await Employee.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

test.group('POST /api/billing/subscription/changes/decrease — autenticación y rol', () => {
  test('decrease responde 401 sin token', async ({ client }) => {
    const response = await client
      .post('/api/billing/subscription/changes/decrease')
      .json({ employees: 80 })
    response.assertStatus(401)
  })

  test('cancel responde 401 sin token', async ({ client }) => {
    const response = await client.post('/api/billing/subscription/changes/cancel')
    response.assertStatus(401)
  })

  test('empleado recibe 403 en decrease y cancel', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-employee', roleSlug: 'empleado' })

    try {
      const decrease = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 80 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      decrease.assertStatus(403)
      decrease.assertBodyContains({
        key: 'solo-el-dueno-de-la-cuenta',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.FORBIDDEN_ROLE,
      })

      const cancel = await client
        .post('/api/billing/subscription/changes/cancel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      cancel.assertStatus(403)
      cancel.assertBodyContains({
        key: 'solo-el-dueno-de-la-cuenta',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.FORBIDDEN_ROLE,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('owner sin suscripción viva recibe 422 sin-suscripcion-viva', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-no-sub', roleSlug: 'owner' })

    try {
      const response = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 80 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'sin-suscripcion-viva',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.NO_LIVE_SUBSCRIPTION,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })
})

test.group('POST /api/billing/subscription/changes/decrease — agendar (CA-1/CA-7)', (group) => {
  let planId: number | null = null

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('owner agenda reducción scheduled sin mover la suscripción (CA-1)', async ({
    client,
    assert,
  }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-owner', roleSlug: 'owner' })
    const subscription = await createLiveSubscription(actor.businessUnit, planId!, 120)

    try {
      const before = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      const expectedEffectiveAt = toCalendarIsoDate(before.billingSubscriptionCurrentPeriodEnd)

      const response = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 80 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(201)
      response.assertBodyContains({ type: 'success' })
      assert.equal(response.body().data.billingSubscriptionChangeType, 'decrease')
      assert.equal(response.body().data.billingSubscriptionChangeStatus, 'scheduled')
      assert.equal(response.body().data.billingSubscriptionChangePreviousEmployees, 120)
      assert.equal(response.body().data.billingSubscriptionChangeNewEmployees, 80)
      assert.equal(response.body().data.billingSubscriptionChangeProratedAmountCents, 0)
      assert.equal(response.body().data.billingSubscriptionChangeEffectiveAt, expectedEffectiveAt)
      assert.isNull(response.body().data.supersededBillingSubscriptionChangeId)

      const change = await BillingSubscriptionChange.findOrFail(
        response.body().data.billingSubscriptionChangeId
      )
      assert.equal(change.billingSubscriptionChangeStatus, 'scheduled')
      assert.equal(change.billingSubscriptionChangeProratedAmountCents, 0)

      const after = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(
        after.billingSubscriptionContractedEmployees,
        before.billingSubscriptionContractedEmployees
      )
      assert.equal(
        after.billingSubscriptionContractedTotal,
        before.billingSubscriptionContractedTotal
      )
      assert.equal(
        toCalendarIsoDate(after.billingSubscriptionCurrentPeriodEnd),
        toCalendarIsoDate(before.billingSubscriptionCurrentPeriodEnd)
      )
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('cantidad que no es reducción responde 422 cambio-no-es-reduccion (CA-7)', async ({
    client,
  }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-not-down', roleSlug: 'owner' })
    await createLiveSubscription(actor.businessUnit, planId!, 120)

    try {
      const increaseAttempt = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 150 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      increaseAttempt.assertStatus(422)
      increaseAttempt.assertBodyContains({
        key: 'cambio-no-es-reduccion',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_NOT_A_DECREASE,
      })

      const sameAttempt = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 120 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      sameAttempt.assertStatus(422)
      sameAttempt.assertBodyContains({
        key: 'cambio-no-es-reduccion',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_NOT_A_DECREASE,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('cantidad no múltiplo de 10 responde 422 (CA-6)', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-block', roleSlug: 'owner' })
    await createLiveSubscription(actor.businessUnit, planId!, 120)

    try {
      const response = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 85 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'cantidad-no-multiplo-de-diez',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('cantidad por debajo del mínimo por plantilla responde 422 con data (CA-5)', async ({
    client,
    assert,
  }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-headcount', roleSlug: 'owner' })
    await createLiveSubscription(actor.businessUnit, planId!, 120)
    await seedActiveEmployees(actor.businessUnit.businessUnitId, 15)

    try {
      const response = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 10 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'cantidad-menor-a-plantilla-activa',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT,
      })
      assert.deepEqual(response.body().data, { active: 15, minimum: 20 })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('periodo vencido responde 422 periodo-sin-dias-por-prorratear (CA-14)', async ({
    client,
  }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-period', roleSlug: 'owner' })
    await createLiveSubscription(actor.businessUnit, planId!, 120, { periodEndOffsetDays: -1 })

    try {
      const response = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 80 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'periodo-sin-dias-por-prorratear',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.PERIOD_NOT_PRORATABLE,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('suscripción past_due rechaza agendar (CA-8)', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-past-due', roleSlug: 'owner' })
    await createLiveSubscription(actor.businessUnit, planId!, 120, { status: 'past_due' })

    try {
      const response = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 80 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'suscripcion-con-pago-atrasado',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_PAST_DUE,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })
})

test.group('POST /api/billing/subscription/changes — cancelar y sustituir (CA-3/CA-4/CA-10)', (group) => {
  let planId: number | null = null

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('owner cancela cambio agendado sin tocar la suscripción (CA-3)', async ({
    client,
    assert,
  }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-cancel', roleSlug: 'owner' })
    const subscription = await createLiveSubscription(actor.businessUnit, planId!, 120)

    try {
      const before = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)

      const schedule = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 80 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      schedule.assertStatus(201)
      const changeId = schedule.body().data.billingSubscriptionChangeId

      const cancel = await client
        .post('/api/billing/subscription/changes/cancel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      cancel.assertStatus(200)
      assert.equal(cancel.body().data.billingSubscriptionChangeStatus, 'canceled')
      assert.equal(cancel.body().data.billingSubscriptionChangeId, changeId)

      const liveCount = await BillingSubscriptionChange.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .whereIn('billing_subscription_change_status', LIVE_SUBSCRIPTION_CHANGE_STATUSES)
        .whereNull('billing_subscription_change_deleted_at')
        .count('* as total')

      assert.equal(Number(liveCount[0].$extras.total), 0)

      const after = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(
        after.billingSubscriptionContractedEmployees,
        before.billingSubscriptionContractedEmployees
      )
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('nueva solicitud sustituye la anterior (CA-4)', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-replace', roleSlug: 'owner' })
    const subscription = await createLiveSubscription(actor.businessUnit, planId!, 120)

    try {
      const first = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 80 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      first.assertStatus(201)
      const firstId = first.body().data.billingSubscriptionChangeId

      const second = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 90 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      second.assertStatus(201)
      assert.equal(second.body().data.billingSubscriptionChangeNewEmployees, 90)
      assert.equal(second.body().data.billingSubscriptionChangeStatus, 'scheduled')
      assert.equal(second.body().data.supersededBillingSubscriptionChangeId, firstId)

      const firstRow = await BillingSubscriptionChange.findOrFail(firstId)
      assert.equal(firstRow.billingSubscriptionChangeStatus, 'canceled')

      const liveRows = await BillingSubscriptionChange.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .whereIn('billing_subscription_change_status', LIVE_SUBSCRIPTION_CHANGE_STATUSES)
        .whereNull('billing_subscription_change_deleted_at')

      assert.lengthOf(liveRows, 1)
      assert.equal(liveRows[0].billingSubscriptionChangeNewEmployees, 90)
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('cancelar sin cambio vivo responde 422 sin-cambio-vivo (CA-10)', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-no-live', roleSlug: 'owner' })
    await createLiveSubscription(actor.businessUnit, planId!, 120)

    try {
      const response = await client
        .post('/api/billing/subscription/changes/cancel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'sin-cambio-vivo',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.NO_LIVE_CHANGE,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('past_due rechaza cancelar cambio agendado (CA-8)', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'decrease-cancel-pd', roleSlug: 'owner' })
    await createLiveSubscription(actor.businessUnit, planId!, 120, { status: 'past_due' })

    try {
      const response = await client
        .post('/api/billing/subscription/changes/cancel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'suscripcion-con-pago-atrasado',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_PAST_DUE,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })
})

test.group('POST /api/billing/subscription/changes — aislamiento (CA-12)', (group) => {
  let planId: number | null = null

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('owner no opera sobre empresa ajena', async ({ client }) => {
    const ownerA = await createTenantActor({ emailPrefix: 'decrease-bu-a', roleSlug: 'owner' })
    const ownerB = await createTenantActor({ emailPrefix: 'decrease-bu-b', roleSlug: 'owner' })
    await createLiveSubscription(ownerB.businessUnit, planId!, 120)

    try {
      const decrease = await client
        .post('/api/billing/subscription/changes/decrease')
        .json({ employees: 80 })
        .loginAs(ownerA.user)
        .header('X-Business-Unit-Id', ownerB.businessUnit.businessUnitPublicId)

      decrease.assertStatus(404)
      decrease.assertBodyContains({ key: 'BU.NOT.001' })

      const cancel = await client
        .post('/api/billing/subscription/changes/cancel')
        .loginAs(ownerA.user)
        .header('X-Business-Unit-Id', ownerB.businessUnit.businessUnitPublicId)

      cancel.assertStatus(404)
      cancel.assertBodyContains({ key: 'BU.NOT.001' })
    } finally {
      await cleanupTenantActor(ownerA)
      await cleanupTenantActor(ownerB)
    }
  })
})

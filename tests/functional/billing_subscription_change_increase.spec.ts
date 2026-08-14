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
import BillingSubscriptionChange from '#models/billing_subscription_change'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { toBusinessDateString } from '#utils/business_date'

/**
 * Tests funcionales — POST /api/billing/subscription/changes/increase (USRH1786107870850).
 */

const TEST_PASSWORD = 'BillingChangeIncreaseTest123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function ensureOwnerRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'owner').first()
  if (!role) {
    throw new Error('Se requiere el rol owner en BD para probar increase.')
  }
  return role
}

async function ensureEmployeeRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'empleado').first()
  if (!role) {
    throw new Error('Se requiere el rol empleado en BD para probar increase.')
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
  person.personFirstname = 'BillingIncrease'
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
  businessUnit.businessUnitName = `Billing Increase ${stamp}`
  businessUnit.businessUnitSlug = `billing-increase-${stamp}`
  businessUnit.businessUnitLegalName = `Billing Increase Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Billing Increase Plan ${stamp}`,
    billingPlanDescription: 'Fixture solicitud de aumento',
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

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 101,
    billingVolumeTierDiscountPercent: 15,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createLiveSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  contractedEmployees: number
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees,
    skipTrial: true,
  })

  const today = toBusinessDateString()
  subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(today).minus({ days: 10 })
  subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(today).plus({ days: 20 })
  await subscription.save()

  return subscription
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
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

test.group('POST /api/billing/subscription/changes/increase — autenticación y rol', () => {
  test('responde 401 sin token', async ({ client }) => {
    const response = await client
      .post('/api/billing/subscription/changes/increase')
      .json({ employees: 150 })
    response.assertStatus(401)
  })

  test('empleado recibe 403 PLT.SUB.FORBIDDEN_ROLE', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'increase-employee', roleSlug: 'empleado' })

    try {
      const response = await client
        .post('/api/billing/subscription/changes/increase')
        .json({ employees: 150 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(403)
      response.assertBodyContains({
        key: 'solo-el-dueno-de-la-cuenta',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.FORBIDDEN_ROLE,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('owner sin suscripción viva recibe 422 sin-suscripcion-viva', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'increase-no-sub', roleSlug: 'owner' })

    try {
      const response = await client
        .post('/api/billing/subscription/changes/increase')
        .json({ employees: 150 })
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

test.group('POST /api/billing/subscription/changes/increase — solicitud (CA-1/CA-7)', (group) => {
  let planId: number | null = null

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('owner registra aumento pending_payment sin mover la suscripción', async ({
    client,
    assert,
  }) => {
    const actor = await createTenantActor({ emailPrefix: 'increase-owner', roleSlug: 'owner' })
    const subscription = await createLiveSubscription(actor.businessUnit, planId!, 100)

    try {
      const before = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)

      const response = await client
        .post('/api/billing/subscription/changes/increase')
        .json({ employees: 150 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(201)
      response.assertBodyContains({ type: 'success' })
      assert.equal(response.body().data.billingSubscriptionChangeStatus, 'pending_payment')
      assert.equal(response.body().data.nextStep, 'awaiting_payment')
      assert.equal(response.body().data.contractedEmployees, 100)
      assert.isNotNull(response.body().data.proration)

      const change = await BillingSubscriptionChange.findOrFail(
        response.body().data.billingSubscriptionChangeId
      )
      assert.equal(change.billingSubscriptionChangeStatus, 'pending_payment')
      assert.equal(change.billingSubscriptionChangePreviousEmployees, 100)
      assert.equal(change.billingSubscriptionChangeNewEmployees, 150)

      const after = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(
        after.billingSubscriptionContractedEmployees,
        before.billingSubscriptionContractedEmployees
      )
      assert.equal(
        after.billingSubscriptionContractedTotal,
        before.billingSubscriptionContractedTotal
      )
    } finally {
      await cleanupTenantActor(actor)
    }
  })

  test('cantidad que no es aumento responde 422 cantidad-no-es-aumento', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'increase-not-up', roleSlug: 'owner' })
    await createLiveSubscription(actor.businessUnit, planId!, 100)

    try {
      const response = await client
        .post('/api/billing/subscription/changes/increase')
        .json({ employees: 90 })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'cantidad-no-es-aumento',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_NOT_AN_INCREASE,
      })
    } finally {
      await cleanupTenantActor(actor)
    }
  })
})

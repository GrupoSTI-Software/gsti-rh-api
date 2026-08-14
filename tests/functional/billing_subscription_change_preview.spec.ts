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
import Employee from '#models/employee'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { toBusinessDateString } from '#utils/business_date'

/**
 * Tests funcionales — GET /api/billing/subscription/change-preview (USRH1786107870847).
 */

const TEST_PASSWORD = 'BillingChangePreviewTest123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function ensureOwnerRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'owner').first()
  if (!role) {
    throw new Error('Se requiere el rol owner en BD para probar change-preview.')
  }
  return role
}

async function ensureEmployeeRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'empleado').first()
  if (!role) {
    throw new Error('Se requiere el rol empleado en BD para probar change-preview.')
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
  person.personFirstname = 'BillingPreview'
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
  businessUnit.businessUnitName = `Billing Preview ${stamp}`
  businessUnit.businessUnitSlug = `billing-preview-${stamp}`
  businessUnit.businessUnitLegalName = `Billing Preview Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Billing Preview Plan ${stamp}`,
    billingPlanDescription: 'Fixture de previsualización de cambio',
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

test.group('GET /api/billing/subscription/change-preview — autenticación y rol', () => {
  test('responde 401 sin token', async ({ client }) => {
    const response = await client.get('/api/billing/subscription/change-preview?employees=100')
    response.assertStatus(401)
  })

  test('empleado recibe 403 PLT.SUB.FORBIDDEN_ROLE', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'preview-employee', roleSlug: 'empleado' })

    try {
      const response = await client
        .get('/api/billing/subscription/change-preview?employees=100')
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
    const actor = await createTenantActor({ emailPrefix: 'preview-no-sub', roleSlug: 'owner' })

    try {
      const response = await client
        .get('/api/billing/subscription/change-preview?employees=100')
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

test.group('GET /api/billing/subscription/change-preview — previsualización (CA-1/CA-3)', (group) => {
  let planId: number | null = null

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('owner consulta aumento y reducción sin modificar la suscripción', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'preview-owner', roleSlug: 'owner' })
    const subscription = await createLiveSubscription(actor.businessUnit, planId!, 100)

    try {
      const before = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)

      const increase = await client
        .get('/api/billing/subscription/change-preview?employees=150')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      increase.assertStatus(200)
      increase.assertBodyContains({ type: 'success' })
      assert.equal(increase.body().data.changeType, 'increase')
      assert.equal(increase.body().data.contractedEmployees, 100)
      assert.equal(increase.body().data.requestedEmployees, 150)
      assert.isNotNull(increase.body().data.proration)
      assert.isNull(increase.body().data.effectiveFrom)

      const none = await client
        .get('/api/billing/subscription/change-preview?employees=100')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      none.assertStatus(200)
      assert.equal(none.body().data.changeType, 'none')
      assert.isNull(none.body().data.proration)
      assert.isNull(none.body().data.effectiveFrom)

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

  test('cantidad no múltiplo de 10 responde 422 sin importes', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'preview-block', roleSlug: 'owner' })
    await createLiveSubscription(actor.businessUnit, planId!, 100)

    try {
      const response = await client
        .get('/api/billing/subscription/change-preview?employees=55')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(422)
      response.assertBodyContains({
        key: 'cantidad-no-multiplo-de-diez',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN,
      })
      assert.notProperty(response.body(), 'data')
    } finally {
      await cleanupTenantActor(actor)
    }
  })
})

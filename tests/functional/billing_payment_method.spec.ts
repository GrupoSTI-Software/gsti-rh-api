import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Stripe from 'stripe'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import Employee from '#models/employee'
import BusinessUnitUser from '#models/business_unit_user'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { BILLING_PROVIDER_ERROR_CODES } from '#constants/billing_provider_error_codes'
import { toBusinessDateString } from '#utils/business_date'
import { ensureRole } from '#tests/helpers/ensure_role'
import type { StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'

const TEST_PASSWORD = 'BillingPaymentMethodTest123!'

const ENABLED_SETTINGS: StripeSettings = {
  status: 'enabled',
  mode: 'test',
  secretKey: 'sk_test_fixtureSecret1',
  publishableKey: 'pk_test_fixturePub1',
  webhookSecret: 'whsec_fixtureHook1',
}

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createTenantActor(options: {
  emailPrefix: string
  roleSlug: 'owner' | 'empleado'
}): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${options.emailPrefix}-${stamp}@gsti-tests.local`
  const role = await ensureRole(options.roleSlug)

  const person = new Person()
  person.personFirstname = 'PaymentMethod'
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
  businessUnit.businessUnitName = `Payment Method ${stamp}`
  businessUnit.businessUnitSlug = `payment-method-${stamp}`
  businessUnit.businessUnitLegalName = `Payment Method Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function createPublishedPlan(): Promise<number> {
  const stamp = Date.now()
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Payment Method Plan ${stamp}`,
    billingPlanDescription: 'Fixture USRH1790724549203',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 150,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 14,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createLiveSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  provider: 'manual' | 'stripe'
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees: 10,
    skipTrial: true,
  })

  const today = toBusinessDateString()
  subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(today).minus({ days: 5 })
  subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(today).plus({ days: 25 })
  subscription.billingSubscriptionProvider = provider
  if (provider === 'stripe') {
    subscription.billingSubscriptionStripeCustomerId = 'cus_fixtureA'
    subscription.billingSubscriptionStripeSubscriptionId = 'sub_fixtureA'
  }
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

const FIXTURE_PM = {
  id: 'pm_fixtureA',
  type: 'card',
  card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2028 },
} as unknown as Stripe.PaymentMethod

test.group('GET /api/billing/subscription/payment-method — USRH1790724549203', (group) => {
  group.setup(async () => {
    await ensureRole('owner')
    await ensureRole('empleado')
  })

  test('CA-1: manual responde managed false sin llamar a Stripe', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'pm-manual', roleSlug: 'owner' })
    const planId = await createPublishedPlan()
    let stripeCalls = 0

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => {
      stripeCalls += 1
      throw new Error('Stripe no debió invocarse')
    })
    const restore = billingProviderRegistry.register(adapter)

    try {
      await createLiveSubscription(actor.businessUnit, planId, 'manual')

      const response = await client
        .get('/api/billing/subscription/payment-method')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      response.assertBodyContains({ type: 'success', data: { managed: false } })
      assert.equal(response.headers()['cache-control'], 'no-store')
      assert.equal(stripeCalls, 0)
    } finally {
      restore()
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-3: stripe devuelve tarjeta de la suscripción', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'pm-stripe', roleSlug: 'owner' })
    const planId = await createPublishedPlan()
    const calls: string[] = []

    try {
      await createLiveSubscription(actor.businessUnit, planId, 'stripe')

      const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => {
        return {
          subscriptions: {
            retrieve: async (id: string) => {
              calls.push(`sub:${id}`)
              return { default_payment_method: FIXTURE_PM }
            },
          },
          customers: {
            retrieve: async () => {
              calls.push('customer')
              return {}
            },
          },
        } as unknown as Stripe
      })
      const restore = billingProviderRegistry.register(adapter)

      const first = await client
        .get('/api/billing/subscription/payment-method')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      first.assertStatus(200)
      first.assertBodyContains({
        data: {
          managed: true,
          card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2028 },
        },
      })

      const second = await client
        .get('/api/billing/subscription/payment-method')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      second.assertStatus(200)

      assert.equal(calls.filter((c) => c.startsWith('sub:')).length, 2)
      assert.notInclude(calls, 'customer')

      restore()
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-7: empleado recibe 403 PLT.SUB.FORBIDDEN_ROLE', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'pm-employee', roleSlug: 'empleado' })
    const planId = await createPublishedPlan()

    try {
      await createLiveSubscription(actor.businessUnit, planId, 'stripe')

      const response = await client
        .get('/api/billing/subscription/payment-method')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(403)
      response.assertBodyContains({
        key: 'solo-el-dueno-de-la-cuenta',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.FORBIDDEN_ROLE,
        detail: 'Solo el dueño de la cuenta puede ver o cambiar la tarjeta de cobro.',
      })
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-6: adaptador stripe deshabilitado responde STRIPE_NOT_CONFIGURED', async ({
    client,
  }) => {
    const actor = await createTenantActor({ emailPrefix: 'pm-no-stripe', roleSlug: 'owner' })
    const planId = await createPublishedPlan()

    try {
      await createLiveSubscription(actor.businessUnit, planId, 'stripe')

      const disabled: StripeSettings = {
        status: 'disabled',
        reason: 'missing-secret',
        warnings: [],
      }
      const adapter = new StripeBillingProviderAdapter(disabled, () => {
        throw new Error('cliente no debió crearse')
      })
      const restore = billingProviderRegistry.register(adapter)

      const response = await client
        .get('/api/billing/subscription/payment-method')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
        .setup((request) => {
          request.request.ok(() => true)
        })

      response.assertStatus(500)
      response.assertBodyContains({
        code: BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED,
        key: 'stripe-no-configurado',
      })

      restore()
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })
})

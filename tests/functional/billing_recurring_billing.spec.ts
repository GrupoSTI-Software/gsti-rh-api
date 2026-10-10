import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import Employee from '#models/employee'
import BusinessUnitUser from '#models/business_unit_user'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'
import { toBusinessDateString } from '#utils/business_date'
import { ensureRole } from '#tests/helpers/ensure_role'
import type { StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'

const TEST_PASSWORD = 'BillingRecurringTest123!'
const PERIOD_AMOUNT_CENTS = 237_000

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
  person.personFirstname = 'Recurring'
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
  businessUnit.businessUnitName = `Recurring ${stamp}`
  businessUnit.businessUnitSlug = `recurring-${stamp}`
  businessUnit.businessUnitLegalName = `Recurring Legal ${stamp}`
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
    billingPlanName: `Recurring Plan ${stamp}`,
    billingPlanDescription: 'Fixture',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 0,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 10,
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
    subscription.billingSubscriptionStripeCustomerId = 'cus_recurring_fixture'
    subscription.billingSubscriptionStripeSubscriptionId = 'sub_recurring_fixture'
  }
  await subscription.save()

  return subscription
}

async function createTenantPayment(params: {
  subscription: BillingSubscription
  paidAt: DateTime
  provider: string
  method: 'transfer' | 'cash' | 'other' | 'card'
  amountCents?: number
  periodsCovered?: number
}): Promise<BillingPayment> {
  const periodsCovered = params.periodsCovered ?? 1
  return BillingPayment.create({
    billingSubscriptionId: params.subscription.billingSubscriptionId,
    billingPaymentAmountCents: params.amountCents ?? PERIOD_AMOUNT_CENTS,
    billingPaymentPeriodAmountCents: PERIOD_AMOUNT_CENTS,
    billingPaymentPeriodsCovered: periodsCovered,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: 0,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: 0,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: 0,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: params.method,
    billingPaymentReference: null,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: params.provider,
    billingPaymentPaidAt: params.paidAt,
    billingPaymentPeriodStart:
      periodsCovered === 0 ? null : params.paidAt.minus({ months: 1 }),
    billingPaymentPeriodEnd: periodsCovered === 0 ? null : params.paidAt,
  })
}

async function cleanupPlan(planId: number | null) {
  if (!planId) return
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

async function cleanupTenantActor(actor: TenantActor | null) {
  if (!actor) return
  const subscriptions = await BillingSubscription.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .select('billing_subscription_id')
  const subscriptionIds = subscriptions.map((row) => row.billingSubscriptionId)
  if (subscriptionIds.length > 0) {
    await BillingPayment.query()
      .whereIn('billing_subscription_id', subscriptionIds)
      .delete()
  }
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

test.group('GET /api/billing/subscription/recurring-billing — USRH1790708507781', (group) => {
  group.setup(async () => {
    await ensureRole('owner')
    await ensureRole('empleado')
  })

  test('CA-1: manual responde automatic false', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'rec-manual', roleSlug: 'owner' })
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
        .get('/api/billing/subscription/recurring-billing')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      response.assertBodyContains({ type: 'success', data: { automatic: false } })
      assert.equal(response.headers()['cache-control'], 'no-store')
      assert.equal(stripeCalls, 0)
    } finally {
      restore()
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-3: activa sin fallo devuelve pagos', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'rec-active', roleSlug: 'owner' })
    const planId = await createPublishedPlan()

    try {
      const subscription = await createLiveSubscription(actor.businessUnit, planId, 'stripe')
      await createTenantPayment({
        subscription,
        paidAt: DateTime.fromISO('2026-09-01T15:00:00Z'),
        provider: BILLING_PROVIDER_KEYS.STRIPE,
        method: 'card',
      })
      await createTenantPayment({
        subscription,
        paidAt: DateTime.fromISO('2026-08-01T15:00:00Z'),
        provider: BILLING_PROVIDER_KEYS.STRIPE,
        method: 'transfer',
      })

      const response = await client
        .get('/api/billing/subscription/recurring-billing')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.automatic, true)
      assert.isNull(data.lastFailure)
      assert.isFalse(data.failureActive)
      assert.lengthOf(data.payments, 2)
      assert.equal(data.payments[0].amountCents, PERIOD_AMOUNT_CENTS)
      assert.notProperty(data, 'billingSubscriptionId')
      assert.notProperty(data.payments[0], 'billingPaymentId')
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-4 y CA-8: fallo vigente con fecha civil CDMX', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'rec-failure', roleSlug: 'owner' })
    const planId = await createPublishedPlan()

    try {
      const subscription = await createLiveSubscription(actor.businessUnit, planId, 'stripe')
      subscription.billingSubscriptionStatus = 'past_due'
      subscription.billingSubscriptionLastPaymentFailedAt = DateTime.fromISO(
        '2026-10-14T04:10:00Z'
      )
      subscription.billingSubscriptionLastPaymentFailureReason = 'insufficient_funds'
      await subscription.save()

      const response = await client
        .get('/api/billing/subscription/recurring-billing')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const data = response.body().data
      assert.isTrue(data.failureActive)
      assert.equal(data.lastFailure.at, '2026-10-13')
      assert.equal(data.lastFailure.reason, 'insufficient_funds')
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-5: motivo desconocido se normaliza a other', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'rec-reason', roleSlug: 'owner' })
    const planId = await createPublishedPlan()

    try {
      const subscription = await createLiveSubscription(actor.businessUnit, planId, 'stripe')
      subscription.billingSubscriptionLastPaymentFailedAt = DateTime.fromISO(
        '2026-10-01T12:00:00Z'
      )
      subscription.billingSubscriptionLastPaymentFailureReason = 'fraudulent'
      await subscription.save()

      const response = await client
        .get('/api/billing/subscription/recurring-billing')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      assert.equal(response.body().data.lastFailure.reason, 'other')
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-6: pago stripe posterior supera el fallo', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'rec-overcome', roleSlug: 'owner' })
    const planId = await createPublishedPlan()

    try {
      const subscription = await createLiveSubscription(actor.businessUnit, planId, 'stripe')
      const failedAt = DateTime.fromISO('2026-10-10T12:00:00Z')
      subscription.billingSubscriptionLastPaymentFailedAt = failedAt
      subscription.billingSubscriptionLastPaymentFailureReason = 'card_declined'
      await subscription.save()

      await createTenantPayment({
        subscription,
        paidAt: DateTime.fromISO('2026-10-11T12:00:00Z'),
        provider: BILLING_PROVIDER_KEYS.STRIPE,
        method: 'card',
      })

      const response = await client
        .get('/api/billing/subscription/recurring-billing')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const data = response.body().data
      assert.isFalse(data.failureActive)
      assert.lengthOf(data.payments, 1)
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-7: periodos cubiertos cero dejan periodo null', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'rec-period', roleSlug: 'owner' })
    const planId = await createPublishedPlan()

    try {
      const subscription = await createLiveSubscription(actor.businessUnit, planId, 'stripe')
      await createTenantPayment({
        subscription,
        paidAt: DateTime.fromISO('2026-09-01T12:00:00Z'),
        provider: BILLING_PROVIDER_KEYS.MANUAL,
        method: 'other',
        periodsCovered: 0,
      })

      const response = await client
        .get('/api/billing/subscription/recurring-billing')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      const payment = response.body().data.payments[0]
      assert.equal(payment.periodsCovered, 0)
      assert.isNull(payment.periodStart)
      assert.isNull(payment.periodEnd)
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-9: empleado recibe 403 PLT.SUB.FORBIDDEN_ROLE', async ({ client }) => {
    const actor = await createTenantActor({ emailPrefix: 'rec-employee', roleSlug: 'empleado' })
    const planId = await createPublishedPlan()

    try {
      await createLiveSubscription(actor.businessUnit, planId, 'stripe')

      const response = await client
        .get('/api/billing/subscription/recurring-billing')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(403)
      response.assertBodyContains({
        key: 'solo-el-dueno-de-la-cuenta',
        code: BILLING_SUBSCRIPTION_ERROR_CODES.FORBIDDEN_ROLE,
        detail: 'Solo el dueño de la cuenta puede consultar el cobro de la suscripción.',
      })
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })
})

test.group('GET /api/billing/subscription/me — automaticBilling USRH1790708507781', () => {
  test('CA-2: stripe live expone automaticBilling true al dueño', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'rec-me-stripe', roleSlug: 'owner' })
    const planId = await createPublishedPlan()

    try {
      await createLiveSubscription(actor.businessUnit, planId, 'stripe')

      const response = await client
        .get('/api/billing/subscription/me')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      assert.isTrue(response.body().data.automaticBilling)
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })

  test('CA-1: manual expone automaticBilling false', async ({ client, assert }) => {
    const actor = await createTenantActor({ emailPrefix: 'rec-me-manual', roleSlug: 'owner' })
    const planId = await createPublishedPlan()

    try {
      await createLiveSubscription(actor.businessUnit, planId, 'manual')

      const response = await client
        .get('/api/billing/subscription/me')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
      assert.isFalse(response.body().data.automaticBilling)
    } finally {
      await cleanupTenantActor(actor)
      await cleanupPlan(planId)
    }
  })
})

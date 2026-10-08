import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import BusinessUnit from '#models/business_unit'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionTransition from '#models/billing_subscription_transition'
import BillingPayment from '#models/billing_payment'
import User from '#models/user'
import Person from '#models/person'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import BillingSubscriptionClockService from '#services/billing_subscription_clock_service'
import PlatformSubscriptionFlowService from '#services/platform_subscription_flow_service'
import { BILLING_SUBSCRIPTION_TRANSITION_CLOCK_ORIGIN_KEY } from '#models/billing_subscription_transition'
import { ensureRole } from '#tests/helpers/ensure_role'

/**
 * USRH1790724549026 — origen de bitácora, idempotencia del reloj, analítica y columnas de fallo (CA-2…CA-6).
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
const TEST_PASSWORD = 'BillingTransitionOrigin9026!'
const MES = '2026-09'
const CUT_DATE = '2026-09-15'
const CLOCK_DATE = '2026-09-02'

let cachedPlatformToken: string | null = null

function mysqlError(error: unknown): { code?: string; sqlMessage?: string; message?: string } {
  if (error && typeof error === 'object') {
    return error as { code?: string; sqlMessage?: string; message?: string }
  }
  return {}
}

async function createPublishedPlan(): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Transition Origin Plan ${STAMP}`,
    billingPlanDescription: 'Fixture USRH1790724549026',
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

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(label: string): Promise<BusinessUnit> {
  const unique = `${STAMP}-${Math.floor(Math.random() * 1_000_000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Transition Origin ${label} ${unique}`
  businessUnit.businessUnitSlug = `transition-origin-${label}-${unique}`
  businessUnit.businessUnitLegalName = `Transition Origin Legal ${label} ${STAMP}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()
  return businessUnit
}

async function createManualSubscription(planId: number): Promise<BillingSubscription> {
  const businessUnit = await createBusinessUnit('sub')
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees: 10,
    skipTrial: true,
  })
  return subscription
}

async function cleanupSubscription(subscriptionId: number): Promise<void> {
  await BillingPayment.query().where('billing_subscription_id', subscriptionId).delete()
  await BillingSubscriptionTransition.query()
    .where('billing_subscription_id', subscriptionId)
    .delete()
  const sub = await BillingSubscription.find(subscriptionId)
  if (sub) {
    await sub.delete()
  }
}

async function createPlatformAdmin(): Promise<User> {
  const role = await ensureRole('root')
  const email = `platform-admin-transition-${STAMP}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'Platform'
  person.personLastname = 'Transition9026'
  person.personSecondLastname = STAMP
  person.personEmail = email
  await person.save()

  const user = new User()
  user.personId = person.personId
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.isPlatformAdmin = true
  user.userEmailType = 'institutional'
  await user.save()
  return user
}

async function platformConsoleToken(client: ApiClient, admin: User): Promise<string> {
  if (cachedPlatformToken) {
    return cachedPlatformToken
  }
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: admin.userEmail,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = (response.body() as { data?: { token?: string } }).data?.token
  if (!token) {
    throw new Error('Login de plataforma no devolvió token')
  }
  cachedPlatformToken = token
  return token
}

test.group('BillingSubscriptionTransition — origen (9026 / CA-2…CA-6)', (group) => {
  let planId: number

  group.setup(async () => {
    planId = await createPublishedPlan()
  })

  test('CA-2: el reloj persiste origen clock y clave fija', async ({ assert }) => {
    const subscription = await createManualSubscription(planId)
    subscription.billingSubscriptionStatus = 'active'
    subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO('2026-08-01')
    subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO('2026-09-01')
    await subscription.save()

    const clock = new BillingSubscriptionClockService()
    await clock.run(CLOCK_DATE)

    const row = await BillingSubscriptionTransition.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .where('billing_subscription_transition_cut_date', CLOCK_DATE)
      .firstOrFail()

    assert.equal(row.billingSubscriptionTransitionOrigin, 'clock')
    assert.equal(
      row.billingSubscriptionTransitionOriginKey,
      BILLING_SUBSCRIPTION_TRANSITION_CLOCK_ORIGIN_KEY
    )

    await cleanupSubscription(subscription.billingSubscriptionId)
  })

  test('CA-3: conviven reloj y proveedor el mismo día; duplicados rechazan UNIQUE', async ({
    assert,
  }) => {
    const subscription = await createManualSubscription(planId)
    const subscriptionId = subscription.billingSubscriptionId
    const cut = DateTime.fromISO(CUT_DATE)

    await BillingSubscriptionTransition.create({
      billingSubscriptionId: subscriptionId,
      billingSubscriptionTransitionFrom: 'active',
      billingSubscriptionTransitionTo: 'past_due',
      billingSubscriptionTransitionReason: 'period_expired',
      billingSubscriptionTransitionCutDate: cut,
    })

    for (const originKey of ['evt_fixtureS1a', 'evt_fixtureS1b'] as const) {
      await BillingSubscriptionTransition.create({
        billingSubscriptionId: subscriptionId,
        billingSubscriptionTransitionFrom: 'active',
        billingSubscriptionTransitionTo: 'past_due',
        billingSubscriptionTransitionReason: 'provider_past_due',
        billingSubscriptionTransitionOrigin: 'provider',
        billingSubscriptionTransitionOriginKey: originKey,
        billingSubscriptionTransitionCutDate: cut,
      })
    }

    const countAfterSeed = await BillingSubscriptionTransition.query()
      .where('billing_subscription_id', subscriptionId)
      .count('* as total')
    assert.equal(Number(countAfterSeed[0].$extras.total), 3)

    for (const duplicate of [
      () =>
        BillingSubscriptionTransition.create({
          billingSubscriptionId: subscriptionId,
          billingSubscriptionTransitionFrom: 'active',
          billingSubscriptionTransitionTo: 'past_due',
          billingSubscriptionTransitionReason: 'period_expired',
          billingSubscriptionTransitionCutDate: cut,
        }),
      () =>
        BillingSubscriptionTransition.create({
          billingSubscriptionId: subscriptionId,
          billingSubscriptionTransitionFrom: 'active',
          billingSubscriptionTransitionTo: 'past_due',
          billingSubscriptionTransitionReason: 'provider_past_due',
          billingSubscriptionTransitionOrigin: 'provider',
          billingSubscriptionTransitionOriginKey: 'evt_fixtureS1a',
          billingSubscriptionTransitionCutDate: cut,
        }),
    ] as const) {
      let caught: unknown
      try {
        await duplicate()
      } catch (error) {
        caught = error
      }
      const parsed = mysqlError(caught)
      assert.equal(parsed.code, 'ER_DUP_ENTRY')
      const message = `${parsed.sqlMessage ?? ''}${parsed.message ?? ''}`
      assert.include(message, 'uq_billing_sub_transition_cut_origin')
    }

    const countFinal = await BillingSubscriptionTransition.query()
      .where('billing_subscription_id', subscriptionId)
      .count('* as total')
    assert.equal(Number(countFinal[0].$extras.total), 3)

    await cleanupSubscription(subscriptionId)
  })

  test('CA-4: reloj idempotente tras migración (dos corridas el mismo día)', async ({
    assert,
  }) => {
    const subscription = await createManualSubscription(planId)
    subscription.billingSubscriptionStatus = 'active'
    subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO('2026-08-01')
    subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO('2026-09-01')
    await subscription.save()

    const clock = new BillingSubscriptionClockService()
    const first = await clock.run(CLOCK_DATE)
    const second = await clock.run(CLOCK_DATE)

    assert.equal(first.failed, 0)
    assert.equal(second.failed, 0)

    const rows = await BillingSubscriptionTransition.query().where(
      'billing_subscription_id',
      subscription.billingSubscriptionId
    )
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].billingSubscriptionTransitionOrigin, 'clock')

    await subscription.refresh()
    assert.equal(subscription.billingSubscriptionStatus, 'past_due')

    await cleanupSubscription(subscription.billingSubscriptionId)
  })

  test('CA-5: analítica ignora razones de proveedor', async ({ assert }) => {
    const flowService = new PlatformSubscriptionFlowService()
    const before = await flowService.getSubscriptionFlows(MES)

    const subscription = await createManualSubscription(planId)
    const cut = DateTime.fromISO(`${MES}-20`)

    for (const reason of ['provider_past_due', 'provider_canceled'] as const) {
      await BillingSubscriptionTransition.create({
        billingSubscriptionId: subscription.billingSubscriptionId,
        billingSubscriptionTransitionFrom: 'active',
        billingSubscriptionTransitionTo: reason === 'provider_canceled' ? 'canceled' : 'past_due',
        billingSubscriptionTransitionReason: reason,
        billingSubscriptionTransitionOrigin: 'provider',
        billingSubscriptionTransitionOriginKey: `evt_fixture9026-${reason}-${STAMP}`,
        billingSubscriptionTransitionCutDate: cut,
      })
    }

    const after = await flowService.getSubscriptionFlows(MES)
    assert.deepEqual(after, before)

    const trialBySub = await flowService.getTrialTransitionBySubscription([
      String(subscription.billingSubscriptionId),
    ])
    assert.isFalse(trialBySub.has(String(subscription.billingSubscriptionId)))

    await cleanupSubscription(subscription.billingSubscriptionId)
  })

  test('CA-6: columnas de fallo fuera de serialize y del GET de plataforma', async ({
    assert,
    client,
  }) => {
    const subscription = await createManualSubscription(planId)
    await subscription.refresh()
    assert.isNull(subscription.billingSubscriptionLastPaymentFailedAt)
    assert.isNull(subscription.billingSubscriptionLastPaymentFailureReason)
    assert.isNull(subscription.billingSubscriptionLastPaymentFailureInvoiceRef)

    subscription.billingSubscriptionLastPaymentFailedAt = DateTime.fromISO(
      '2026-09-20T15:00:00Z'
    )
    subscription.billingSubscriptionLastPaymentFailureReason = 'insufficient_funds'
    subscription.billingSubscriptionLastPaymentFailureInvoiceRef = 'in_fixtureS1'
    await subscription.save()

    const serialized = JSON.stringify(subscription.serialize())
    for (const forbidden of ['in_fixtureS1', 'insufficient_funds', 'LastPayment']) {
      assert.notInclude(serialized, forbidden)
    }

    const admin = await createPlatformAdmin()
    const token = await platformConsoleToken(client, admin)
    const response = await client
      .get(`/api/platform/billing/subscriptions/${subscription.billingSubscriptionId}`)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const bodyRaw = JSON.stringify(response.body())
    for (const forbidden of ['in_fixtureS1', 'insufficient_funds', 'LastPayment']) {
      assert.notInclude(bodyRaw, forbidden)
    }

    await cleanupSubscription(subscription.billingSubscriptionId)
  })
})

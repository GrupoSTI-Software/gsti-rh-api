import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Stripe from 'stripe'
import type { I18n } from '@adonisjs/i18n'
import SignupDraft from '#models/signup_draft'
import User from '#models/user'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import SignupDraftService from '#services/signup_draft_service'
import StripeBillingProviderAdapter, {
  buildStripeSubscriptionParams,
} from '#modules/billing-provider/stripe_billing_provider.adapter'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import { BILLING_PROVIDER_ERROR_CODES } from '#constants/billing_provider_error_codes'
import { todayInBusinessZone } from '#utils/business_date'
import { ensureRole } from '#tests/helpers/ensure_role'

const FIXTURE_TOKEN = '3f2b9c1e-7d4a-4e8b-9a61-5c0d2e7f8a90'
function getI18nStub(): I18n {
  return {
    formatMessage: (key: string) => key,
    t: (key: string, _params?: unknown, fallback?: string) => fallback ?? key,
  } as unknown as I18n
}

async function createPublishedStripePlan(stamp: number, trialDays = 14): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Signup Complete Stripe ${stamp}`,
    billingPlanDescription: 'Fixture stripe complete',
    billingPlanProvider: 'manual',
  })
  const yesterday = todayInBusinessZone().minus({ days: 1 }).toISODate()!
  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 79,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: trialDays,
    billingPlanPriceEffectiveFrom: yesterday,
    billingPlanPriceStripePriceId: 'price_fake_1',
    billingPlanPriceProvider: 'stripe',
  })
  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })
  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function cleanupPlan(planId: number) {
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

function buildFakeStripeClient(signupDraftId: number, subscriptionId: string) {
  const customerUpdates: unknown[] = []
  const subscriptionCreates: unknown[] = []

  const fakeStripe = {
    setupIntents: {
      retrieve: async (id: string) => ({
        id,
        status: 'succeeded',
        customer: 'cus_fx',
        usage: 'off_session',
        payment_method: 'pm_fx',
        metadata: { valanserh_signup_draft_id: String(signupDraftId) },
      }),
    },
    customers: {
      update: async (_id: string, params: unknown) => {
        customerUpdates.push(params)
        return {}
      },
    },
    subscriptions: {
      list: async () => ({ data: [] }),
      create: async (params: unknown, opts: unknown) => {
        subscriptionCreates.push([params, opts])
        return { id: subscriptionId, status: 'trialing' }
      },
      cancel: async () => ({}),
      retrieve: async () => ({ status: 'canceled' }),
    },
  } as unknown as Stripe

  return { fakeStripe, customerUpdates, subscriptionCreates }
}

test.group('SignupDraftService.complete() — Stripe (USRH1790708507607)', (group) => {
  group.setup(async () => {
    await ensureRole('owner')
  })

  test('CA-2: alta con tarjeta confirmada crea empresa y suscripción stripe', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const fixtureEmail = `prospecto-stripe-${stamp}@correo.test`
    const subscriptionId = `sub_fx_${stamp}`
    const planId = await createPublishedStripePlan(stamp)
    const draft = await SignupDraft.create({
      signupDraftEmail: fixtureEmail,
      signupDraftFirstName: 'Prospecto',
      signupDraftLastName: 'Fixture',
      signupDraftSecondLastName: null,
      signupDraftBusinessUnitName: 'Empresa Fixture Stripe',
      signupDraftBillingPlanId: planId,
      signupDraftContractedEmployees: 30,
      signupDraftPinCode: null,
      signupDraftPinExpiresAt: null,
      signupDraftEmailVerifiedAt: DateTime.now(),
      signupDraftToken: FIXTURE_TOKEN,
      signupDraftStripeCustomerId: 'cus_fx',
      signupDraftStripeSetupIntentId: 'seti_fx',
    })

    const { fakeStripe, subscriptionCreates } = buildFakeStripeClient(
      draft.signupDraftId,
      subscriptionId
    )
    const adapter = new StripeBillingProviderAdapter(
      {
        status: 'enabled',
        mode: 'test',
        secretKey: 'sk_test_fixtureSecret1',
        publishableKey: 'pk_test_fixturePub1',
        webhookSecret: null,
      },
      () => fakeStripe
    )
    const restore = billingProviderRegistry.register(adapter)

    const expectedTrialEndsAt = todayInBusinessZone().plus({ days: 14 })
    const expectedTrialEndEpoch = expectedTrialEndsAt.toSeconds()

    try {
      const service = new SignupDraftService(getI18nStub())
      const result = await service.complete({
        signupDraftId: draft.signupDraftId,
        signupToken: FIXTURE_TOKEN,
        password: 'FixtureComplete123!',
        passwordConfirm: 'FixtureComplete123!',
      })

      assert.equal(result.status, 200)

      const user = await User.query().where('user_email', fixtureEmail).first()
      assert.isNotNull(user)

      const subscription = await BillingSubscription.query()
        .where('billing_subscription_stripe_subscription_id', subscriptionId)
        .first()
      assert.isNotNull(subscription)
      assert.equal(subscription!.billingSubscriptionProvider, 'stripe')
      assert.equal(subscription!.billingSubscriptionStripeCustomerId, 'cus_fx')
      assert.equal(
        subscription!.billingSubscriptionTrialEndsAt?.toISODate(),
        expectedTrialEndsAt.toISODate()
      )

      assert.lengthOf(subscriptionCreates, 1)
      const [params, opts] = subscriptionCreates[0] as [
        ReturnType<typeof buildStripeSubscriptionParams>,
        { idempotencyKey: string },
      ]
      assert.equal(params.customer, 'cus_fx')
      assert.deepEqual(params.items, [{ price: 'price_fake_1' }])
      assert.equal(params.default_payment_method, 'pm_fx')
      const trialEndEpoch =
        typeof params.trial_end === 'number' ? params.trial_end : Number(params.trial_end ?? 0)
      assert.isTrue(trialEndEpoch >= expectedTrialEndEpoch)
      assert.equal(
        opts.idempotencyKey,
        `valanserh-signup-draft-${draft.signupDraftId}-subscription-1`
      )

      const draftAfter = await SignupDraft.query().where('signup_draft_id', draft.signupDraftId).first()
      assert.isNull(draftAfter)
    } finally {
      restore()
      const sub = await BillingSubscription.query()
        .where('billing_subscription_stripe_subscription_id', subscriptionId)
        .first()
      if (sub) {
        await sub.delete()
      }
    }
  })

  test('CA-4: sin SetupIntent → CARD_NOT_CONFIRMED y sin empresa', async ({ assert }) => {
    const stamp = Date.now() + 1
    const planId = await createPublishedStripePlan(stamp)
    const email = `sin-tarjeta-${stamp}@fixture.test`
    const token = FIXTURE_TOKEN

    const draft = await SignupDraft.create({
      signupDraftEmail: email,
      signupDraftFirstName: 'Sin',
      signupDraftLastName: 'Tarjeta',
      signupDraftSecondLastName: null,
      signupDraftBusinessUnitName: 'Sin Tarjeta BU',
      signupDraftBillingPlanId: planId,
      signupDraftContractedEmployees: 10,
      signupDraftPinCode: null,
      signupDraftPinExpiresAt: null,
      signupDraftEmailVerifiedAt: DateTime.now(),
      signupDraftToken: token,
      signupDraftStripeCustomerId: null,
      signupDraftStripeSetupIntentId: null,
    })

    const adapter = new StripeBillingProviderAdapter(
      {
        status: 'enabled',
        mode: 'test',
        secretKey: 'sk_test_fixtureSecret1',
        publishableKey: 'pk_test_fixturePub1',
        webhookSecret: null,
      },
      () => ({}) as unknown as Stripe
    )
    const restore = billingProviderRegistry.register(adapter)

    try {
      const result = await new SignupDraftService(getI18nStub()).complete({
        signupDraftId: draft.signupDraftId,
        signupToken: token,
        password: 'SinTarjetaTest123!',
        passwordConfirm: 'SinTarjetaTest123!',
      })

      assert.equal(result.status, 422)
      assert.equal(result.code, BILLING_PROVIDER_ERROR_CODES.CARD_NOT_CONFIRMED)
      assert.isNull(await User.query().where('user_email', email).first())
      const reloaded = await SignupDraft.findOrFail(draft.signupDraftId)
      assert.equal(reloaded.signupDraftStripeSubscriptionAttempt, 0)
      assert.isNull(reloaded.signupDraftCompletionClaimedAt)
    } finally {
      restore()
      await SignupDraft.query().where('signup_draft_id', draft.signupDraftId).delete()
      await cleanupPlan(planId)
    }
  })
})

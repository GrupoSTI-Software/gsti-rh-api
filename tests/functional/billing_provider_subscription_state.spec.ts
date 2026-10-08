import Stripe from 'stripe'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import BillingProviderEvent, {
  BILLING_PROVIDER_EVENT_STATUSES,
} from '#models/billing_provider_event'
import BillingProviderSubscriptionStateMail from '#mails/billing_provider_subscription_state_mail'
import { BILLING_SUBSCRIPTION_TRANSITION_CLOCK_ORIGIN_KEY } from '#models/billing_subscription_transition'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionTransition from '#models/billing_subscription_transition'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'
import type {
  ProviderPaymentFailure,
  ProviderSubscriptionState,
} from '#modules/billing-provider/billing_provider.port'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import type { StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { todayInBusinessZone } from '#utils/business_date'

const WEBHOOK_SECRET = 'whsec_fixtureHook1'
const PII_SENTINEL_EMAIL = 'prospecto.fixture@correo.test'
const TEST_SMTP_SENDER = 'smtp-billing-state7723@gsti.local'
const DEV_GATE_RECIPIENT_A = 'wramirez@gruposti.com'
const DEV_GATE_RECIPIENT_B = 'jsoto@gruposti.com'

async function withEnvVars(
  vars: Record<string, string | undefined>,
  executor: () => Promise<void>
): Promise<void> {
  const originals: Record<string, string | undefined> = {}
  const previousGet = env.get.bind(env) as (key: string, defaultValue?: unknown) => unknown

  for (const [key, value] of Object.entries(vars)) {
    originals[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  ;(env as unknown as { get: typeof previousGet }).get = (
    key: string,
    defaultValue?: unknown
  ) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const value = vars[key]
      if (value === undefined) {
        return defaultValue
      }
      return value
    }
    return previousGet(key, defaultValue)
  }

  try {
    await executor()
  } finally {
    ;(env as unknown as { get: typeof previousGet }).get = previousGet
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function withSmtpConfigured(executor: () => Promise<void>): Promise<void> {
  await withEnvVars({ SMTP_USERNAME: TEST_SMTP_SENDER }, executor)
}
const STRIPE_FIXTURE_SETTINGS: StripeSettings = {
  status: 'enabled',
  mode: 'test',
  secretKey: 'sk_test_fixtureSecret1',
  publishableKey: null,
  webhookSecret: WEBHOOK_SECRET,
}

const EVENT_CREATED = 1_789_916_400 // 2026-09-20T15:00:00Z
const EVENT_CREATED_PLUS = 1_789_916_460
const EVENT_OLDER = 1_789_916_520
const EVENT_SECOND_FAILURE = 1_790_089_200 // 2026-09-22T15:00:00Z
const EVENT_CA5_PAST_DUE = 1_789_540_200 // 2026-09-16 00:30 CDMX
const EVENT_CA5_CANCELED = 1_789_540_260

type FixtureStateSnap = {
  state: ProviderSubscriptionState
  failure: ProviderPaymentFailure
}

class FixtureStateStripeAdapter extends StripeBillingProviderAdapter {
  readStateCalls = 0
  readFailureCalls = 0
  private readonly verifyDelegate = new StripeBillingProviderAdapter(STRIPE_FIXTURE_SETTINGS)

  constructor(private readonly snap: FixtureStateSnap) {
    super(STRIPE_FIXTURE_SETTINGS, () => {
      throw new Error('Red no esperada en FixtureStateStripeAdapter')
    })
  }

  override verifyWebhookEvent(rawBody: string, signatureHeader: string | null) {
    return this.verifyDelegate.verifyWebhookEvent(rawBody, signatureHeader)
  }

  override async readSubscriptionState(subscriptionRef: string): Promise<ProviderSubscriptionState> {
    this.readStateCalls += 1
    return { ...this.snap.state, subscriptionRef: this.snap.state.subscriptionRef || subscriptionRef }
  }

  override async readInvoicePaymentFailure(invoiceRef: string): Promise<ProviderPaymentFailure> {
    this.readFailureCalls += 1
    return { ...this.snap.failure, invoiceRef }
  }
}

function signPayload(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
}

function stripeEventPayload(
  id: string,
  type: string,
  dataObject: Record<string, unknown>,
  created = EVENT_CREATED
): string {
  return JSON.stringify({
    id,
    object: 'event',
    type,
    livemode: false,
    created,
    data: { object: dataObject },
  })
}

function uniqueStripeRefs(): { subRef: string; cusRef: string } {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return { subRef: `sub_fixtureS2_${stamp}`, cusRef: `cus_fixtureS2_${stamp}` }
}

async function createStripeSubscriptionFixture(
  refs = uniqueStripeRefs()
): Promise<BillingSubscription & { subRef: string; cusRef: string }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
  const { subRef, cusRef } = refs
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `State Stripe Plan ${stamp}`,
    billingPlanDescription: 'Fixture USRH1790708507723',
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

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `State Stripe BU ${stamp}`
  businessUnit.businessUnitSlug = `state-stripe-bu-${stamp}`
  businessUnit.businessUnitLegalName = `State Stripe Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'self_service'
  await businessUnit.save()

  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: plan.billingPlanId,
    contractedEmployees: 10,
    skipTrial: true,
  })

  subscription.billingSubscriptionProvider = BILLING_PROVIDER_KEYS.STRIPE
  subscription.billingSubscriptionStripeSubscriptionId = subRef
  subscription.billingSubscriptionStripeCustomerId = cusRef
  subscription.billingSubscriptionStatus = 'active'
  await subscription.save()

  return Object.assign(subscription, { subRef, cusRef })
}

function registerStateAdapter(
  subRef: string,
  cusRef: string,
  failure: ProviderPaymentFailure,
  status: ProviderSubscriptionState['status'] = 'past_due'
): {
  adapter: FixtureStateStripeAdapter
  restore: () => void
  snap: FixtureStateSnap
} {
  const snap: FixtureStateSnap = {
    state: { subscriptionRef: subRef, customerRef: cusRef, status },
    failure: { ...failure },
  }
  const adapter = new FixtureStateStripeAdapter(snap)
  const restore = billingProviderRegistry.register(adapter)
  return { adapter, restore, snap }
}

async function postStripeWebhook(
  client: ApiClient,
  payload: string,
  expectStatus = 200
): Promise<ReturnType<ApiClient['post']>> {
  const request = client
    .post('/api/webhooks/stripe')
    .header('stripe-signature', signPayload(payload))
    .header('Content-Type', 'application/json')
  if (expectStatus >= 400) {
    request.setup((req) => {
      req.request.ok(() => true)
    })
  }
  const response = await request.json(payload)
  response.assertStatus(expectStatus)
  return response
}

async function cleanupSubscription(subscriptionId: number): Promise<void> {
  await BillingSubscriptionTransition.query()
    .where('billing_subscription_id', subscriptionId)
    .delete()
  await BillingProviderEvent.query()
    .where('billing_subscription_id', subscriptionId)
    .delete()
  const sub = await BillingSubscription.find(subscriptionId)
  if (sub) {
    await sub.delete()
  }
}

test.group('POST /api/webhooks/stripe — estado Stripe (7723)', () => {
  test('CA-2: cobro rechazado → past_due, transición proveedor y último fallo', async ({
    client,
    assert,
  }) => {
    const subscription = await createStripeSubscriptionFixture()
    const { adapter, restore } = registerStateAdapter(subscription.subRef, subscription.cusRef, {
      invoiceRef: 'in_fixtureS2a',
      subscriptionRef: subscription.subRef,
      customerRef: subscription.cusRef,
      errorCode: 'card_declined',
      declineCode: 'insufficient_funds',
      intentStatus: 'requires_payment_method',
    })
    const eventId = `evt_fixtureS2a_${Date.now()}`

    const payload = stripeEventPayload(eventId, 'invoice.payment_failed', {
      id: 'in_fixtureS2a',
      object: 'invoice',
      customer: subscription.cusRef,
      parent: { subscription_details: { subscription: subscription.subRef } },
    })

    try {
      const response = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .json(payload)

      response.assertStatus(200)
      assert.equal(adapter.readStateCalls, 1)
      assert.equal(adapter.readFailureCalls, 1)

      await subscription.refresh()
      assert.equal(subscription.billingSubscriptionStatus, 'past_due')
      assert.equal(
        subscription.billingSubscriptionLastPaymentFailureReason,
        'insufficient_funds'
      )
      assert.equal(
        subscription.billingSubscriptionLastPaymentFailureInvoiceRef,
        'in_fixtureS2a'
      )
      assert.equal(
        (subscription.billingSubscriptionLastPaymentFailedAt as DateTime).toUTC().toISO(),
        '2026-09-20T15:00:00.000Z'
      )

      const transitions = await BillingSubscriptionTransition.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(transitions, 1)
      assert.equal(transitions[0].billingSubscriptionTransitionFrom, 'active')
      assert.equal(transitions[0].billingSubscriptionTransitionTo, 'past_due')
      assert.equal(transitions[0].billingSubscriptionTransitionReason, 'provider_past_due')
      assert.equal(transitions[0].billingSubscriptionTransitionOrigin, 'provider')
      assert.equal(transitions[0].billingSubscriptionTransitionOriginKey, eventId)
      assert.equal(transitions[0].billingSubscriptionTransitionCutDate.toISODate(), '2026-09-20')

      const row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', eventId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.PROCESSED)

      const eventIdB = `evt_fixtureS2b_${Date.now()}`
      const payloadB = stripeEventPayload(
        eventIdB,
        'customer.subscription.updated',
        {
          id: subscription.subRef,
          object: 'subscription',
          customer: subscription.cusRef,
          status: 'past_due',
        },
        EVENT_CREATED_PLUS
      )
      await postStripeWebhook(client, payloadB)
      assert.equal(adapter.readStateCalls, 2)
      assert.equal(adapter.readFailureCalls, 1)

      const transitionsAfterB = await BillingSubscriptionTransition.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(transitionsAfterB, 1)
      await subscription.refresh()
      assert.equal(
        subscription.billingSubscriptionLastPaymentFailureReason,
        'insufficient_funds'
      )
    } finally {
      restore()
      await cleanupSubscription(subscription.billingSubscriptionId)
    }
  })

  test('CA-3: segundo rechazo actualiza fallo; aviso viejo no sobrescribe', async ({
    client,
    assert,
  }) => {
    const subscription = await createStripeSubscriptionFixture()
    const { adapter, restore, snap } = registerStateAdapter(
      subscription.subRef,
      subscription.cusRef,
      {
        invoiceRef: 'in_fixtureS2a',
        subscriptionRef: subscription.subRef,
        customerRef: subscription.cusRef,
        errorCode: 'card_declined',
        declineCode: 'insufficient_funds',
        intentStatus: 'requires_payment_method',
      }
    )

    try {
      await postStripeWebhook(
        client,
        stripeEventPayload(`evt_fixtureS2a_${Date.now()}`, 'invoice.payment_failed', {
          id: 'in_fixtureS2a',
          object: 'invoice',
          customer: subscription.cusRef,
          parent: { subscription_details: { subscription: subscription.subRef } },
        })
      )
      await postStripeWebhook(
        client,
        stripeEventPayload(
          `evt_fixtureS2b_${Date.now()}`,
          'customer.subscription.updated',
          {
            id: subscription.subRef,
            object: 'subscription',
            customer: subscription.cusRef,
            status: 'past_due',
          },
          EVENT_CREATED_PLUS
        )
      )

      Object.assign(snap.failure, {
        invoiceRef: 'in_fixtureS2c',
        errorCode: 'expired_card',
        declineCode: null,
        intentStatus: null,
      })
      await postStripeWebhook(
        client,
        stripeEventPayload(
          `evt_fixtureS2c_${Date.now()}`,
          'invoice.payment_failed',
          {
            id: 'in_fixtureS2c',
            object: 'invoice',
            customer: subscription.cusRef,
            parent: { subscription_details: { subscription: subscription.subRef } },
          },
          EVENT_SECOND_FAILURE
        )
      )

      assert.lengthOf(
        await BillingSubscriptionTransition.query().where(
          'billing_subscription_id',
          subscription.billingSubscriptionId
        ),
        1
      )
      await subscription.refresh()
      assert.equal(subscription.billingSubscriptionLastPaymentFailureReason, 'expired_card')
      assert.equal(subscription.billingSubscriptionLastPaymentFailureInvoiceRef, 'in_fixtureS2c')
      assert.equal(
        (subscription.billingSubscriptionLastPaymentFailedAt as DateTime).toUTC().toISO(),
        '2026-09-22T15:00:00.000Z'
      )

      Object.assign(snap.failure, {
        invoiceRef: 'in_fixtureS2d',
        errorCode: 'card_declined',
        declineCode: 'generic_decline',
        intentStatus: 'requires_payment_method',
      })
      await postStripeWebhook(
        client,
        stripeEventPayload(
          `evt_fixtureS2d_${Date.now()}`,
          'invoice.payment_failed',
          {
            id: 'in_fixtureS2d',
            object: 'invoice',
            customer: subscription.cusRef,
            parent: { subscription_details: { subscription: subscription.subRef } },
          },
          EVENT_OLDER
        )
      )

      await subscription.refresh()
      assert.equal(subscription.billingSubscriptionLastPaymentFailureReason, 'expired_card')
      assert.equal(subscription.billingSubscriptionLastPaymentFailureInvoiceRef, 'in_fixtureS2c')
      assert.equal(adapter.readStateCalls, 4)
    } finally {
      restore()
      await cleanupSubscription(subscription.billingSubscriptionId)
    }
  })

  test('CA-4: cancelación por Stripe vía deleted e incomplete_expired', async ({
    client,
    assert,
  }) => {
    const pastDue = await createStripeSubscriptionFixture()
    pastDue.billingSubscriptionStatus = 'past_due'
    await pastDue.save()

    const { restore: restorePastDue } = registerStateAdapter(
      pastDue.subRef,
      pastDue.cusRef,
      {
        invoiceRef: 'in_unused',
        subscriptionRef: pastDue.subRef,
        customerRef: pastDue.cusRef,
        errorCode: null,
        declineCode: null,
        intentStatus: null,
      },
      'canceled'
    )

    const eventIdE = `evt_fixtureS2e_${Date.now()}`
    try {
      await postStripeWebhook(
        client,
        stripeEventPayload(eventIdE, 'customer.subscription.deleted', {
          id: pastDue.subRef,
          object: 'subscription',
          customer: pastDue.cusRef,
          status: 'canceled',
        })
      )

      await pastDue.refresh()
      assert.equal(pastDue.billingSubscriptionStatus, 'canceled')
      assert.equal(
        pastDue.billingSubscriptionCanceledAt?.toISODate(),
        todayInBusinessZone().toISODate()
      )
      assert.isNull(pastDue.billingSubscriptionLiveBusinessUnitId)

      const cancelTransition = await BillingSubscriptionTransition.query()
        .where('billing_subscription_id', pastDue.billingSubscriptionId)
        .where('billing_subscription_transition_origin_key', eventIdE)
        .firstOrFail()
      assert.equal(cancelTransition.billingSubscriptionTransitionFrom, 'past_due')
      assert.equal(cancelTransition.billingSubscriptionTransitionTo, 'canceled')
      assert.equal(cancelTransition.billingSubscriptionTransitionReason, 'provider_canceled')
    } finally {
      restorePastDue()
      await cleanupSubscription(pastDue.billingSubscriptionId)
    }

    const active = await createStripeSubscriptionFixture()
    const { restore: restoreActive } = registerStateAdapter(
      active.subRef,
      active.cusRef,
      {
        invoiceRef: 'in_unused',
        subscriptionRef: active.subRef,
        customerRef: active.cusRef,
        errorCode: null,
        declineCode: null,
        intentStatus: null,
      },
      'incomplete_expired'
    )

    try {
      await postStripeWebhook(
        client,
        stripeEventPayload(
          `evt_fixtureS2e2_${Date.now()}`,
          'customer.subscription.updated',
          {
            id: active.subRef,
            object: 'subscription',
            customer: active.cusRef,
            status: 'incomplete_expired',
          }
        )
      )
      await active.refresh()
      assert.equal(active.billingSubscriptionStatus, 'canceled')
      const row = await BillingSubscriptionTransition.query()
        .where('billing_subscription_id', active.billingSubscriptionId)
        .firstOrFail()
      assert.equal(row.billingSubscriptionTransitionFrom, 'active')
      assert.equal(row.billingSubscriptionTransitionReason, 'provider_canceled')
    } finally {
      restoreActive()
      await cleanupSubscription(active.billingSubscriptionId)
    }
  })

  test('CA-5: conviven transición del reloj y dos del proveedor el mismo día', async ({
    client,
    assert,
  }) => {
    const subscription = await createStripeSubscriptionFixture()
    await BillingSubscriptionTransition.create({
      billingSubscriptionId: subscription.billingSubscriptionId,
      billingSubscriptionTransitionFrom: 'trialing',
      billingSubscriptionTransitionTo: 'active',
      billingSubscriptionTransitionReason: 'trial_expired_covered',
      billingSubscriptionTransitionCutDate: DateTime.fromISO('2026-09-16'),
      billingSubscriptionTransitionOrigin: 'clock',
      billingSubscriptionTransitionOriginKey: BILLING_SUBSCRIPTION_TRANSITION_CLOCK_ORIGIN_KEY,
    })

    const { restore, snap } = registerStateAdapter(
      subscription.subRef,
      subscription.cusRef,
      {
        invoiceRef: 'in_unused',
        subscriptionRef: subscription.subRef,
        customerRef: subscription.cusRef,
        errorCode: null,
        declineCode: null,
        intentStatus: null,
      },
      'past_due'
    )

    try {
      await postStripeWebhook(
        client,
        stripeEventPayload(
          `evt_fixtureS2f_${Date.now()}`,
          'customer.subscription.updated',
          {
            id: subscription.subRef,
            object: 'subscription',
            customer: subscription.cusRef,
            status: 'past_due',
          },
          EVENT_CA5_PAST_DUE
        )
      )

      snap.state.status = 'canceled'
      await postStripeWebhook(
        client,
        stripeEventPayload(
          `evt_fixtureS2g_${Date.now()}`,
          'customer.subscription.deleted',
          {
            id: subscription.subRef,
            object: 'subscription',
            customer: subscription.cusRef,
            status: 'canceled',
          },
          EVENT_CA5_CANCELED
        )
      )

      const transitions = await BillingSubscriptionTransition.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .orderBy('billing_subscription_transition_id')
      assert.lengthOf(transitions, 3)
      for (const row of transitions) {
        assert.equal(row.billingSubscriptionTransitionCutDate.toISODate(), '2026-09-16')
      }
      await subscription.refresh()
      assert.equal(subscription.billingSubscriptionStatus, 'canceled')
    } finally {
      restore()
      await cleanupSubscription(subscription.billingSubscriptionId)
    }
  })

  test('CA-7: reentrega del mismo aviso no relée Stripe', async ({ client, assert }) => {
    const subscription = await createStripeSubscriptionFixture()
    const { adapter, restore } = registerStateAdapter(subscription.subRef, subscription.cusRef, {
      invoiceRef: 'in_fixtureS2a',
      subscriptionRef: subscription.subRef,
      customerRef: subscription.cusRef,
      errorCode: 'card_declined',
      declineCode: 'insufficient_funds',
      intentStatus: 'requires_payment_method',
    })
    const eventId = `evt_fixtureS2a_redeliver_${Date.now()}`
    const payload = stripeEventPayload(eventId, 'invoice.payment_failed', {
      id: 'in_fixtureS2a',
      object: 'invoice',
      customer: subscription.cusRef,
      parent: { subscription_details: { subscription: subscription.subRef } },
    })

    try {
      await postStripeWebhook(client, payload)
      const callsAfterFirst = adapter.readStateCalls
      await postStripeWebhook(client, payload)
      assert.equal(adapter.readStateCalls, callsAfterFirst)
      assert.lengthOf(
        await BillingSubscriptionTransition.query().where(
          'billing_subscription_id',
          subscription.billingSubscriptionId
        ),
        1
      )
    } finally {
      restore()
      await cleanupSubscription(subscription.billingSubscriptionId)
    }
  })

  test('CA-9: dos avisos concurrentes dejan una sola transición', async ({ client, assert }) => {
    const subscription = await createStripeSubscriptionFixture()
    const { restore } = registerStateAdapter(subscription.subRef, subscription.cusRef, {
      invoiceRef: 'in_fixtureS2i',
      subscriptionRef: subscription.subRef,
      customerRef: subscription.cusRef,
      errorCode: 'card_declined',
      declineCode: 'insufficient_funds',
      intentStatus: 'requires_payment_method',
    })

    const payloadI = stripeEventPayload(`evt_fixtureS2i_${Date.now()}`, 'invoice.payment_failed', {
      id: 'in_fixtureS2i',
      object: 'invoice',
      customer: subscription.cusRef,
      parent: { subscription_details: { subscription: subscription.subRef } },
    })
    const payloadJ = stripeEventPayload(
      `evt_fixtureS2j_${Date.now()}`,
      'customer.subscription.updated',
      {
        id: subscription.subRef,
        object: 'subscription',
        customer: subscription.cusRef,
        status: 'past_due',
      },
      EVENT_CREATED_PLUS
    )

    try {
      const [responseI, responseJ] = await Promise.all([
        postStripeWebhook(client, payloadI),
        postStripeWebhook(client, payloadJ),
      ])
      responseI.assertStatus(200)
      responseJ.assertStatus(200)

      await subscription.refresh()
      assert.equal(subscription.billingSubscriptionStatus, 'past_due')
      const transitions = await BillingSubscriptionTransition.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(transitions, 1)
      assert.equal(transitions[0].billingSubscriptionTransitionReason, 'provider_past_due')
    } finally {
      restore()
      await cleanupSubscription(subscription.billingSubscriptionId)
    }
  })

  test('CA-10: terminal local, fallo ignorado y estado inesperado con correo sin PII', async ({
    client,
    assert,
  }) => {
    const canceled = await createStripeSubscriptionFixture()
    canceled.billingSubscriptionStatus = 'canceled'
    canceled.billingSubscriptionCanceledAt = todayInBusinessZone()
    canceled.billingSubscriptionLastPaymentFailureReason = null
    canceled.billingSubscriptionLastPaymentFailedAt = null
    canceled.billingSubscriptionLastPaymentFailureInvoiceRef = null
    await canceled.save()

    const bu = await BusinessUnit.find(canceled.businessUnitId)
    const companyName = bu?.businessUnitName ?? 'Fixture Secret SA'
    const { restore: restoreCanceled } = registerStateAdapter(
      canceled.subRef,
      canceled.cusRef,
      {
        invoiceRef: 'in_fixtureS2k',
        subscriptionRef: canceled.subRef,
        customerRef: canceled.cusRef,
        errorCode: 'card_declined',
        declineCode: 'insufficient_funds',
        intentStatus: 'requires_payment_method',
      },
      'active'
    )

    await withSmtpConfigured(async () => {
      await withEnvVars(
        { BILLING_INTERNAL_NOTIFICATION_EMAILS: `${DEV_GATE_RECIPIENT_A},${DEV_GATE_RECIPIENT_B}` },
        async () => {
          const fake = mail.fake()
          try {
            await postStripeWebhook(
              client,
              stripeEventPayload(`evt_fixtureS2alive_${Date.now()}`, 'customer.subscription.updated', {
                id: canceled.subRef,
                object: 'subscription',
                customer: canceled.cusRef,
                status: 'active',
              })
            )

            fake.mails.assertSent(BillingProviderSubscriptionStateMail, ({ message }) => {
              message.assertHtmlIncludes(String(canceled.billingSubscriptionId))
              message.assertHtmlIncludes(canceled.subRef)
              message.assertHtmlIncludes('active')
              message.assertHtmlIncludes('canceled')
              const html = (message.toJSON() as { message: { html: string } }).message.html
              assert.notInclude(html, companyName)
              assert.notInclude(html, PII_SENTINEL_EMAIL)
              return true
            })

            await postStripeWebhook(
              client,
              stripeEventPayload(
                `evt_fixtureS2k_${Date.now()}`,
                'invoice.payment_failed',
                {
                  id: 'in_fixtureS2k',
                  object: 'invoice',
                  customer: canceled.cusRef,
                  parent: { subscription_details: { subscription: canceled.subRef } },
                },
                EVENT_SECOND_FAILURE
              )
            )

            await canceled.refresh()
            assert.isNull(canceled.billingSubscriptionLastPaymentFailureReason)
            fake.mails.assertSentCount(BillingProviderSubscriptionStateMail, 1)
          } finally {
            mail.restore()
          }
        }
      )
    })

    restoreCanceled()
    await cleanupSubscription(canceled.billingSubscriptionId)

    const active = await createStripeSubscriptionFixture()
    const { restore: restorePaused } = registerStateAdapter(
      active.subRef,
      active.cusRef,
      {
        invoiceRef: 'in_unused',
        subscriptionRef: active.subRef,
        customerRef: active.cusRef,
        errorCode: null,
        declineCode: null,
        intentStatus: null,
      },
      'paused'
    )

    await withSmtpConfigured(async () => {
      await withEnvVars(
        { BILLING_INTERNAL_NOTIFICATION_EMAILS: DEV_GATE_RECIPIENT_A },
        async () => {
          const fake2 = mail.fake()
          try {
            await postStripeWebhook(
              client,
              stripeEventPayload(`evt_fixturePaused_${Date.now()}`, 'customer.subscription.updated', {
                id: active.subRef,
                object: 'subscription',
                customer: active.cusRef,
                status: 'paused',
              })
            )
            await active.refresh()
            assert.equal(active.billingSubscriptionStatus, 'active')
            fake2.mails.assertSent(BillingProviderSubscriptionStateMail, ({ message }) => {
              message.assertHtmlIncludes('paused')
              return true
            })
          } finally {
            mail.restore()
          }
        }
      )
    })

    restorePaused()
    await cleanupSubscription(active.billingSubscriptionId)
  })

  test('CA-12: Stripe no responde → failed; reentrega sana → processed', async ({
    client,
    assert,
  }) => {
    const subscription = await createStripeSubscriptionFixture()
    const eventId = `evt_fixtureUnavailable_${Date.now()}`
    const payload = stripeEventPayload(eventId, 'customer.subscription.updated', {
      id: subscription.subRef,
      object: 'subscription',
      customer: subscription.cusRef,
      status: 'past_due',
    })

    const stripeError = new Stripe.errors.StripeInvalidRequestError({
      message: `No such subscription; ${PII_SENTINEL_EMAIL}`,
      type: 'invalid_request_error',
      code: 'resource_missing',
      requestId: 'req_fixture7723',
      statusCode: 404,
    })

    const warnLines: string[] = []
    const originalWarn = logger.warn.bind(logger)
    ;(logger as unknown as { warn: typeof logger.warn }).warn = ((...args: Parameters<
      typeof logger.warn
    >) => {
      warnLines.push(JSON.stringify(args))
      return originalWarn(...args)
    }) as typeof logger.warn

    class UnavailableReadAdapter extends StripeBillingProviderAdapter {
      private readonly verifyDelegate = new StripeBillingProviderAdapter(STRIPE_FIXTURE_SETTINGS)

      constructor() {
        super(STRIPE_FIXTURE_SETTINGS, () =>
          ({
            subscriptions: { retrieve: async () => { throw stripeError } },
          }) as unknown as Stripe
        )
      }

      override verifyWebhookEvent(rawBody: string, signatureHeader: string | null) {
        return this.verifyDelegate.verifyWebhookEvent(rawBody, signatureHeader)
      }
    }

    const restoreFail = billingProviderRegistry.register(new UnavailableReadAdapter())

    try {
      await postStripeWebhook(client, payload, 500)
      const failedRow = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', eventId)
        .firstOrFail()
      assert.equal(failedRow.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.FAILED)
      assert.equal(
        failedRow.billingProviderEventLastErrorCode,
        BILLING_PROVIDER_ERROR_CODES.PROVIDER_STATE_UNAVAILABLE
      )
      for (const line of warnLines) {
        assert.notInclude(line, PII_SENTINEL_EMAIL)
      }

      restoreFail()
      const { restore: restoreOk } = registerStateAdapter(subscription.subRef, subscription.cusRef, {
        invoiceRef: 'in_unused',
        subscriptionRef: subscription.subRef,
        customerRef: subscription.cusRef,
        errorCode: null,
        declineCode: null,
        intentStatus: null,
      })

      await postStripeWebhook(client, payload)
      restoreOk()
      await failedRow.refresh()
      assert.equal(failedRow.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.PROCESSED)
      assert.isAtLeast(failedRow.billingProviderEventAttempts ?? 0, 2)
    } finally {
      await cleanupSubscription(subscription.billingSubscriptionId)
      ;(logger as unknown as { warn: typeof logger.warn }).warn = originalWarn
    }
  })

  test('CA-13: fraudulent se normaliza a card_declined sin crudo en BD', async ({
    client,
    assert,
  }) => {
    const subscription = await createStripeSubscriptionFixture()
    const { restore } = registerStateAdapter(subscription.subRef, subscription.cusRef, {
      invoiceRef: 'in_fixtureFraud',
      subscriptionRef: subscription.subRef,
      customerRef: subscription.cusRef,
      errorCode: 'card_declined',
      declineCode: 'fraudulent',
      intentStatus: 'requires_payment_method',
    })

    try {
      await postStripeWebhook(
        client,
        stripeEventPayload(`evt_fixtureFraud_${Date.now()}`, 'invoice.payment_failed', {
          id: 'in_fixtureFraud',
          object: 'invoice',
          customer: subscription.cusRef,
          parent: { subscription_details: { subscription: subscription.subRef } },
        })
      )
      await subscription.refresh()
      assert.equal(subscription.billingSubscriptionLastPaymentFailureReason, 'card_declined')
      const serialized = JSON.stringify(subscription.serialize())
      assert.notInclude(serialized, 'fraudulent')
    } finally {
      restore()
      await cleanupSubscription(subscription.billingSubscriptionId)
    }
  })

  test('CA-1: suscripción inexistente → ignored sin lecturas', async ({ client, assert }) => {
    const { adapter, restore } = registerStateAdapter('sub_unused', 'cus_unused', {
      invoiceRef: 'in_unused',
      subscriptionRef: 'sub_unused',
      customerRef: 'cus_unused',
      errorCode: null,
      declineCode: null,
      intentStatus: null,
    })
    const eventId = `evt_fixtureNoExiste_${Date.now()}`
    const payload = stripeEventPayload(eventId, 'customer.subscription.updated', {
      id: 'sub_fixtureNoExiste',
      object: 'subscription',
      customer: 'cus_fixtureNoExiste',
      status: 'past_due',
    })

    const response = await client
      .post('/api/webhooks/stripe')
      .header('stripe-signature', signPayload(payload))
      .header('Content-Type', 'application/json')
      .json(payload)

    response.assertStatus(200)
    assert.equal(adapter.readStateCalls, 0)
    assert.equal(adapter.readFailureCalls, 0)

    const row = await BillingProviderEvent.query()
      .where('billing_provider_event_external_id', eventId)
      .firstOrFail()
    assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.IGNORED)

    restore()
    await BillingProviderEvent.query().where('billing_provider_event_external_id', eventId).delete()
  })

  test('CA-11: liga cruzada → 500 uniforme y failed', async ({ client, assert }) => {
    const subscription = await createStripeSubscriptionFixture()
    const { restore } = registerStateAdapter(subscription.subRef, subscription.cusRef, {
      invoiceRef: 'in_fixtureS2a',
      subscriptionRef: 'sub_fixtureB',
      customerRef: subscription.cusRef,
      errorCode: 'card_declined',
      declineCode: 'insufficient_funds',
      intentStatus: 'requires_payment_method',
    })

    const eventId = `evt_fixtureMismatch_${Date.now()}`
    const payload = stripeEventPayload(eventId, 'invoice.payment_failed', {
      id: 'in_fixtureS2a',
      object: 'invoice',
      customer: subscription.cusRef,
      parent: { subscription_details: { subscription: subscription.subRef } },
    })

    try {
      const response = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .setup((request) => {
          request.request.ok(() => true)
        })
        .json(payload)

      response.assertStatus(500)
      const body = response.body() as { code: string; detail: string }
      assert.equal(body.code, BILLING_PROVIDER_ERROR_CODES.WEBHOOK_PROCESSING_FAILED)
      assert.equal(body.detail, BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL)

      await subscription.refresh()
      assert.equal(subscription.billingSubscriptionStatus, 'active')
      assert.isNull(subscription.billingSubscriptionLastPaymentFailureReason)

      const row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', eventId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.FAILED)
      assert.equal(row.billingProviderEventLastErrorCode, 'PLT.PRV.PROVIDER_STATE_MISMATCH')
    } finally {
      restore()
      await cleanupSubscription(subscription.billingSubscriptionId)
    }
  })
})

import Stripe from 'stripe'
import { test } from '@japa/runner'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import BillingProviderEvent, {
  BILLING_PROVIDER_EVENT_STATUSES,
} from '#models/billing_provider_event'
import BillingSubscription from '#models/billing_subscription'
import { billingProviderEventHandlers } from '#modules/billing-provider/billing_provider_event_handlers'
import BillingProviderWebhookService, {
  resolveProviderEventSubscription,
} from '#modules/billing-provider/billing_provider_webhook.service'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import type { StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'

test.group('resolveProviderEventSubscription (7579 / CA-10)', () => {
  test('cero filas → none', ({ assert }) => {
    assert.deepEqual(resolveProviderEventSubscription([]), { kind: 'none' })
  })

  test('una fila → resolved', ({ assert }) => {
    const row = { billingSubscriptionId: 9 } as BillingSubscription
    const result = resolveProviderEventSubscription([row])
    assert.equal(result.kind, 'resolved')
    if (result.kind === 'resolved') {
      assert.equal(result.subscription.billingSubscriptionId, 9)
    }
  })

  test('dos filas → ambiguous', ({ assert }) => {
    const a = { billingSubscriptionId: 1 } as BillingSubscription
    const b = { billingSubscriptionId: 2 } as BillingSubscription
    assert.deepEqual(resolveProviderEventSubscription([a, b]), { kind: 'ambiguous' })
  })
})

const WEBHOOK_SECRET = 'whsec_fixtureAttempt1'
const STRIPE_FIXTURE_SETTINGS: StripeSettings = {
  status: 'enabled',
  mode: 'test',
  secretKey: 'sk_test_fixtureSecret1',
  publishableKey: null,
  webhookSecret: WEBHOOK_SECRET,
}

function signPayload(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
}

test.group('BillingProviderWebhookService — attempt (9115 / CA-12)', (group) => {
  let restoreProvider: (() => void) | null = null

  group.each.setup(() => {
    restoreProvider = billingProviderRegistry.register(
      new StripeBillingProviderAdapter(STRIPE_FIXTURE_SETTINGS)
    )
  })

  group.each.teardown(() => {
    restoreProvider?.()
  })

  test('pasa attempt 1 y 2 en reentregas', async ({ assert }) => {
    const externalId = `evt_fixture_attempt_${Date.now()}`
    const attempts: number[] = []
    const unregister = billingProviderEventHandlers.register('valanserh.fixture_attempt', {
      handle: async (ctx) => {
        attempts.push(ctx.attempt ?? 0)
        throw new BillingProviderServiceError(
          'fallo simulado',
          BILLING_PROVIDER_ERROR_CODES.WEBHOOK_PROCESSING_FAILED,
          500,
          'aviso-no-procesado',
          BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL
        )
      },
    })

    const payload = JSON.stringify({
      id: externalId,
      object: 'event',
      type: 'valanserh.fixture_attempt',
      livemode: false,
      created: 1_700_000_000,
      data: {
        object: {
          id: 'sub_fixtureAttempt',
          object: 'subscription',
          customer: 'cus_fixtureAttempt',
          status: 'active',
        },
      },
    })

    const service = new BillingProviderWebhookService()
    const signature = signPayload(payload)

    try {
      await assert.rejects(() =>
        service.receive('stripe', payload, signature)
      )
      await assert.rejects(() =>
        service.receive('stripe', payload, signature)
      )

      assert.deepEqual(attempts, [1, 2])

      const row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .firstOrFail()
      assert.equal(row.billingProviderEventAttempts, 2)
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.FAILED)
    } finally {
      unregister()
      await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .delete()
    }
  })
})

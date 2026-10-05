import Stripe from 'stripe'
import { test } from '@japa/runner'
import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL,
  BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL,
  BILLING_PROVIDER_WEBHOOK_SIGNATURE_INVALID_DETAIL,
} from '#constants/billing_provider_error_codes'
import BillingProviderEvent, {
  BILLING_PROVIDER_EVENT_STATUSES,
} from '#models/billing_provider_event'
import { billingProviderEventHandlers } from '#modules/billing-provider/billing_provider_event_handlers'
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import type { StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'

const WEBHOOK_SECRET = 'whsec_fixtureHook1'

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

function eventPayload(
  id: string,
  type: string,
  dataObject: Record<string, unknown>,
  livemode = false
): string {
  return JSON.stringify({
    id,
    object: 'event',
    type,
    livemode,
    created: 1_700_000_000,
    data: { object: dataObject },
  })
}

async function countEvents(externalId: string): Promise<number> {
  return BillingProviderEvent.query()
    .where('billing_provider_event_external_id', externalId)
    .count('* as total')
    .then((rows) => Number(rows[0]?.$extras.total ?? 0))
}

test.group('POST /api/webhooks/stripe (7579)', (group) => {
  let restoreProvider: (() => void) | null = null

  group.each.setup(() => {
    restoreProvider = billingProviderRegistry.register(
      new StripeBillingProviderAdapter(STRIPE_FIXTURE_SETTINGS)
    )
  })

  group.each.teardown(() => {
    restoreProvider?.()
    restoreProvider = null
  })

  test('CA-3: tipo sin manejador queda ignored con 200', async ({ client, assert }) => {
    const externalId = `evt_fixture_ignore_${Date.now()}`
    const payload = eventPayload(externalId, 'balance.available', { id: 'ba_x', object: 'balance' })

    const response = await client
      .post('/api/webhooks/stripe')
      .header('stripe-signature', signPayload(payload))
      .header('Content-Type', 'application/json')
      .json(payload)

    response.assertStatus(200)
    assert.deepEqual(response.body(), { type: 'success', data: { received: true } })
    assert.equal(await countEvents(externalId), 1)

    const row = await BillingProviderEvent.query()
      .where('billing_provider_event_external_id', externalId)
      .firstOrFail()
    assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.IGNORED)
    assert.equal(row.billingProviderEventAttempts, 1)
    assert.isNotNull(row.billingProviderEventProcessedAt)
  })

  test('CA-2: manejador de prueba procesa una vez', async ({ client, assert }) => {
    const externalId = 'evt_fixtureW2'
    let handlerCalls = 0
    const unregister = billingProviderEventHandlers.register('valanserh.fixture_processed', {
      handle: async (ctx) => {
        handlerCalls += 1
        assert.equal(ctx.event.id, externalId)
        return { status: 'processed' }
      },
    })

    const payload = eventPayload(externalId, 'valanserh.fixture_processed', {
      id: 'sub_fixtureW1',
      object: 'subscription',
      customer: 'cus_fixtureW1',
      status: 'active',
    })

    try {
      const response = await client
        .post('/api/webhooks/stripe')
        .header('stripe-signature', signPayload(payload))
        .header('Content-Type', 'application/json')
        .json(payload)

      response.assertStatus(200)
      assert.equal(handlerCalls, 1)
      const row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.PROCESSED)
      assert.equal(row.billingProviderEventObjectId, 'sub_fixtureW1')
    } finally {
      unregister()
      await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .delete()
    }
  })

  test('CA-7: firma inválida → 400 sin filas', async ({ client, assert }) => {
    const externalId = `evt_fixture_bad_sig_${Date.now()}`
    const payload = eventPayload(externalId, 'balance.available', { id: 'ba_y', object: 'balance' })

    const response = await client
      .post('/api/webhooks/stripe')
      .header('stripe-signature', 't=0,v1=deadbeef')
      .header('Content-Type', 'application/json')
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json(payload)

    response.assertStatus(400)
    const body = response.body() as { code: string; detail: string }
    assert.equal(body.code, BILLING_PROVIDER_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID)
    assert.equal(body.detail, BILLING_PROVIDER_WEBHOOK_SIGNATURE_INVALID_DETAIL)
    assert.equal(await countEvents(externalId), 0)
  })

  test('CA-5: manejador que falla → 500 uniforme y fila failed', async ({ client, assert }) => {
    const externalId = `evt_fixture_fail_${Date.now()}`
    const unregister = billingProviderEventHandlers.register('valanserh.fixture_fail', {
      handle: async () => {
        throw new Error('prospecto.fixture@correo.test')
      },
    })

    const payload = eventPayload(externalId, 'valanserh.fixture_fail', {
      id: 'sub_fixtureFail',
      object: 'subscription',
      customer: 'cus_fixtureFail',
      status: 'active',
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
      assert.notInclude(JSON.stringify(body), 'prospecto.fixture@correo.test')

      const row = await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .firstOrFail()
      assert.equal(row.billingProviderEventStatus, BILLING_PROVIDER_EVENT_STATUSES.FAILED)
      assert.equal(
        row.billingProviderEventLastErrorCode,
        BILLING_PROVIDER_ERROR_CODES.WEBHOOK_PROCESSING_FAILED
      )
    } finally {
      unregister()
      await BillingProviderEvent.query()
        .where('billing_provider_event_external_id', externalId)
        .delete()
    }
  })
})

test.group('POST /api/webhooks/stripe — sin secreto (7579 / CA-9)', (group) => {
  let restoreProvider: (() => void) | null = null

  group.each.setup(() => {
    restoreProvider = billingProviderRegistry.register(
      new StripeBillingProviderAdapter({
        ...STRIPE_FIXTURE_SETTINGS,
        webhookSecret: null,
      })
    )
  })

  group.each.teardown(() => {
    restoreProvider?.()
  })

  test('responde STRIPE_NOT_CONFIGURED sin filas', async ({ client, assert }) => {
    const before = await BillingProviderEvent.query().count('* as total')
    const beforeCount = Number(before[0]?.$extras.total ?? 0)

    const response = await client
      .post('/api/webhooks/stripe')
      .header('Content-Type', 'application/json')
      .setup((request) => {
        request.request.ok(() => true)
      })
      .json({})

    response.assertStatus(500)
    const body = response.body() as { code: string; detail: string }
    assert.equal(body.code, BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED)
    assert.equal(body.detail, BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL)

    const after = await BillingProviderEvent.query().count('* as total')
    assert.equal(Number(after[0]?.$extras.total ?? 0), beforeCount)
  })
})

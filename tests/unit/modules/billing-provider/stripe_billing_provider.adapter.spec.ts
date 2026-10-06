import { inspect } from 'node:util'
import { Writable } from 'node:stream'
import { test } from '@japa/runner'
import { pino } from 'pino'
import Stripe from 'stripe'
import {
  BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL,
  BILLING_PROVIDER_PROVIDER_REQUEST_FAILED_DETAIL,
  BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL,
  BILLING_PROVIDER_ERROR_CODES,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import ManualBillingProviderAdapter from '#modules/billing-provider/manual_billing_provider.adapter'
import {
  BILLING_PROVIDER_KEYS,
  isBillingInvoiceProvider,
  type BillingProviderPort,
} from '#modules/billing-provider/billing_provider.port'
import StripeBillingProviderAdapter, {
  buildInvoiceItemParams,
  buildStripeCardSetupCustomerParams,
  buildStripeSetupIntentParams,
  buildStripePriceParams,
  buildStripeProductParams,
  catalogIdempotencyKey,
  cardSetupIdempotencyKey,
  invoiceChargeIdempotencyKey,
} from '#modules/billing-provider/stripe_billing_provider.adapter'
import type { StripeSettings } from '#modules/billing-provider/stripe_billing_provider.config'

const DISABLED_SETTINGS: StripeSettings = {
  status: 'disabled',
  reason: 'missing-secret',
  warnings: [],
}

const ENABLED_SETTINGS: StripeSettings = {
  status: 'enabled',
  mode: 'test',
  secretKey: 'sk_test_fixtureSecret1',
  publishableKey: 'pk_test_fixturePub1',
  webhookSecret: 'whsec_fixtureHook1',
}

function assertProviderError(error: unknown): BillingProviderServiceError {
  if (!(error instanceof BillingProviderServiceError)) {
    throw new Error('Se esperaba BillingProviderServiceError')
  }
  return error
}

test.group('StripeBillingProviderAdapter — guardias (7496)', () => {
  test('CA-6: deshabilitado → STRIPE_NOT_CONFIGURED en openSubscription y admitRecordedPayment', async ({
    assert,
  }) => {
    const adapter = new StripeBillingProviderAdapter(DISABLED_SETTINGS)

    for (const call of [
      () => adapter.openSubscription({ businessUnitId: 1, billingPlanId: 1, billingPlanPriceId: 1, contractedEmployees: 1 }),
      () => adapter.admitRecordedPayment({ billingSubscriptionId: 1, method: 'transfer' }),
    ] as const) {
      try {
        await call()
        assert.fail('Debió lanzar')
      } catch (error) {
        const typed = assertProviderError(error)
        assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED)
        assert.equal(typed.httpStatus, 500)
        assert.equal(typed.key, 'stripe-no-configurado')
        assert.equal(typed.detail, BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL)
      }
    }
  })

  test('CA-7: habilitado → OPERATION_NOT_AVAILABLE sin red', async ({ assert }) => {
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS)

    for (const operation of ['openSubscription', 'admitRecordedPayment'] as const) {
      try {
        if (operation === 'openSubscription') {
          await adapter.openSubscription({
            businessUnitId: 1,
            billingPlanId: 1,
            billingPlanPriceId: 1,
            contractedEmployees: 1,
          })
        } else {
          await adapter.admitRecordedPayment({ billingSubscriptionId: 1, method: 'transfer' })
        }
        assert.fail('Debió lanzar')
      } catch (error) {
        const typed = assertProviderError(error)
        assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE)
        assert.equal(typed.key, 'operacion-de-cobro-no-disponible')
        assert.equal(typed.detail, BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL)
        assert.include(typed.message, operation)
        assert.notEqual(typed.detail, typed.message)
      }
    }
  })

  test('CA-9: la llave no sale del adaptador ni de describe()', ({ assert }) => {
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS)
    const description = adapter.describe()

    const outputs = [
      JSON.stringify(adapter),
      inspect(adapter),
      JSON.stringify(description),
      inspect(description),
    ]

    for (const output of outputs) {
      assert.notInclude(output, 'fixtureSecret1')
    }

    const chunks: string[] = []
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    })
    const logger = pino({ level: 'info' }, destination)
    logger.info({ adapter, description })
    logger.flush()
    assert.notInclude(chunks.join(''), 'fixtureSecret1')
  })
})

test.group('StripeBillingProviderAdapter — catálogo (7553 / CA-12)', () => {
  test('createCatalogProduct y createCatalogPrice con parámetros e idempotency exactos', async ({
    assert,
  }) => {
    const productCreates: unknown[] = []
    const productUpdates: unknown[] = []
    const priceCreates: unknown[] = []
    const priceUpdates: unknown[] = []

    const client = {
      products: {
        async create(params: unknown, opts: unknown) {
          productCreates.push({ params, opts })
          return { id: 'prod_sim' }
        },
        async update(id: string, params: unknown) {
          productUpdates.push({ id, params })
          return { id }
        },
      },
      prices: {
        async create(params: unknown, opts: unknown) {
          priceCreates.push({ params, opts })
          return { id: 'price_sim' }
        },
        async update(id: string, params: unknown) {
          priceUpdates.push({ id, params })
          return { id }
        },
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => client)

    const productRef = await adapter.createCatalogProduct({ billingPlanId: 3, name: 'Plan Base' })
    assert.deepEqual(productRef, { externalId: 'prod_sim' })
    assert.deepEqual(productCreates[0], {
      params: buildStripeProductParams({ billingPlanId: 3, name: 'Plan Base' }),
      opts: { idempotencyKey: catalogIdempotencyKey('product', 3) },
    })
    assert.deepEqual(productUpdates[0], { id: 'prod_sim', params: { active: true } })

    const priceRef = await adapter.createCatalogPrice({
      productRef: 'prod_sim',
      billingPlanId: 3,
      billingPlanPriceId: 12,
      currency: 'MXN',
      unitAmountCents: 0,
      intervalMonths: 1,
    })
    assert.deepEqual(priceRef, { externalId: 'price_sim' })
    assert.deepEqual(priceCreates[0], {
      params: buildStripePriceParams({
        productRef: 'prod_sim',
        billingPlanId: 3,
        billingPlanPriceId: 12,
        currency: 'MXN',
        unitAmountCents: 0,
        intervalMonths: 1,
      }),
      opts: { idempotencyKey: catalogIdempotencyKey('price', 12) },
    })
    assert.deepEqual(priceUpdates[0], { id: 'price_sim', params: { active: true } })

    await adapter.archiveCatalogProduct('prod_sim')
    await adapter.archiveCatalogPrice('price_sim')
    assert.deepEqual(productUpdates[1], { id: 'prod_sim', params: { active: false } })
    assert.deepEqual(priceUpdates[1], { id: 'price_sim', params: { active: false } })
  })
})

test.group('StripeBillingProviderAdapter — errores SDK (7553 / CA-13)', () => {
  test('StripeError → PROVIDER_REQUEST_FAILED sin filtrar secretos al cliente', async ({
    assert,
  }) => {
    const stripeError = new Stripe.errors.StripeInvalidRequestError({
      message: 'No such product; sk_test_fixtureSecret1',
      type: 'invalid_request_error',
      code: 'resource_missing',
      requestId: 'req_fixture1',
      statusCode: 400,
    })

    const client = {
      products: {
        async create() {
          throw stripeError
        },
        async update() {
          throw stripeError
        },
      },
      prices: {
        async create() {
          throw stripeError
        },
        async update() {
          throw stripeError
        },
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => client)

    for (const call of [
      () => adapter.createCatalogProduct({ billingPlanId: 1, name: 'P' }),
      () =>
        adapter.createCatalogPrice({
          productRef: 'prod_x',
          billingPlanId: 1,
          billingPlanPriceId: 2,
          currency: 'MXN',
          unitAmountCents: 0,
          intervalMonths: 1,
        }),
      () => adapter.archiveCatalogProduct('prod_x'),
      () => adapter.archiveCatalogPrice('price_x'),
    ] as const) {
      try {
        await call()
        assert.fail('Debió lanzar')
      } catch (error) {
        const typed = assertProviderError(error)
        assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED)
        assert.equal(typed.key, 'fallo-del-proveedor-de-cobro')
        assert.notInclude(JSON.stringify(typed), 'fixtureSecret1')
        assert.notInclude(typed.message, 'No such product')
      }
    }
  })

  test('adaptador deshabilitado: catálogo lanza STRIPE_NOT_CONFIGURED sin fábrica', async ({
    assert,
  }) => {
    let factoryCalled = false
    const adapter = new StripeBillingProviderAdapter(DISABLED_SETTINGS, () => {
      factoryCalled = true
      throw new Error('no debe invocarse')
    })

    for (const call of [
      () => adapter.createCatalogProduct({ billingPlanId: 1, name: 'P' }),
      () =>
        adapter.createCatalogPrice({
          productRef: 'prod_x',
          billingPlanId: 1,
          billingPlanPriceId: 2,
          currency: 'MXN',
          unitAmountCents: 0,
          intervalMonths: 1,
        }),
      () => adapter.archiveCatalogProduct('prod_x'),
      () => adapter.archiveCatalogPrice('price_x'),
    ] as const) {
      try {
        await call()
        assert.fail('Debió lanzar')
      } catch (error) {
        assert.equal(
          assertProviderError(error).errorCode,
          BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED
        )
      }
    }
    assert.isFalse(factoryCalled)
  })
})

const WEBHOOK_SECRET = 'whsec_fixtureHook1'

const ENABLED_WITH_WEBHOOK: StripeSettings = {
  ...ENABLED_SETTINGS,
  webhookSecret: WEBHOOK_SECRET,
}

function signPayload(payload: string, secret: string = WEBHOOK_SECRET): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret })
}

function subscriptionEventPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_fixtureW2',
    object: 'event',
    type: 'valanserh.fixture_processed',
    livemode: false,
    created: 1_700_000_000,
    data: {
      object: {
        id: 'sub_fixtureW1',
        object: 'subscription',
        customer: 'cus_fixtureW1',
        status: 'active',
      },
    },
    ...overrides,
  })
}

test.group('StripeBillingProviderAdapter — prepareCardSetup (USRH1790718243123 CA-8)', () => {
  test('customers.create y setupIntents.create con parámetros del spec', async ({ assert }) => {
    const customerCalls: unknown[] = []
    const setupCalls: unknown[] = []
    const fakeStripe = {
      customers: {
        create: async (params: unknown, opts: unknown) => {
          customerCalls.push([params, opts])
          return { id: 'cus_sim' }
        },
      },
      setupIntents: {
        create: async (params: unknown, opts: unknown) => {
          setupCalls.push([params, opts])
          return { id: 'seti_sim', client_secret: 'seti_sim_secret', status: 'requires_payment_method' }
        },
        retrieve: async () => ({ id: 'seti_old', status: 'canceled', customer: 'cus_sim', metadata: {} }),
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(
      ENABLED_SETTINGS,
      () => fakeStripe
    )

    const result = await adapter.prepareCardSetup({
      owner: { kind: 'signup_draft', signupDraftId: 42 },
      email: 'prospecto.fixture@correo.test',
      customerRef: null,
      setupIntentRef: null,
    })

    assert.deepEqual(customerCalls[0], [
      buildStripeCardSetupCustomerParams('prospecto.fixture@correo.test', 42),
      { idempotencyKey: 'valanserh-signup-draft-42-customer' },
    ])
    assert.deepEqual(setupCalls[0], [
      buildStripeSetupIntentParams('cus_sim', 42),
      { idempotencyKey: cardSetupIdempotencyKey(42, null) },
    ])
    assert.equal(result.customerRef, 'cus_sim')
    assert.equal(result.clientSecret, 'seti_sim_secret')
    assert.equal(result.publishableKey, 'pk_test_fixturePub1')
  })

  test('publishableKey null → STRIPE_NOT_CONFIGURED', async ({ assert }) => {
    const adapter = new StripeBillingProviderAdapter({
      ...ENABLED_SETTINGS,
      publishableKey: null,
    })
    try {
      await adapter.prepareCardSetup({
        owner: { kind: 'signup_draft', signupDraftId: 1 },
        email: 'a@b.test',
        customerRef: null,
        setupIntentRef: null,
      })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED
      )
    }
  })
})

test.group('StripeBillingProviderAdapter — complete alta (USRH1790708507607 CA-12/13)', () => {
  test('openSubscription con providerSubscription devuelve refs sin red', async ({ assert }) => {
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS)
    const opening = await adapter.openSubscription({
      businessUnitId: 1,
      billingPlanId: 1,
      billingPlanPriceId: 1,
      contractedEmployees: 10,
      providerSubscription: { customerRef: 'cus_fx', subscriptionRef: 'sub_fx' },
    })
    assert.equal(opening.externalCustomerRef, 'cus_fx')
    assert.equal(opening.externalSubscriptionRef, 'sub_fx')
  })

  test('createProviderSubscription verifica SetupIntent y crea suscripción', async ({ assert }) => {
    const setupRetrieveCalls: string[] = []
    const createCalls: unknown[] = []
    const fakeStripe = {
      setupIntents: {
        retrieve: async (id: string) => {
          setupRetrieveCalls.push(id)
          return {
            id: 'seti_fx',
            status: 'succeeded',
            customer: 'cus_fx',
            usage: 'off_session',
            payment_method: 'pm_fx',
            metadata: { valanserh_signup_draft_id: '99' },
          }
        },
      },
      customers: {
        update: async () => ({}),
      },
      subscriptions: {
        list: async () => ({ data: [] }),
        create: async (params: unknown, opts: unknown) => {
          createCalls.push([params, opts])
          return { id: 'sub_fx', status: 'trialing' }
        },
        cancel: async () => ({}),
        retrieve: async () => ({ status: 'canceled' }),
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => fakeStripe)
    const result = await adapter.createProviderSubscription({
      owner: { kind: 'signup_draft', signupDraftId: 99 },
      customerRef: 'cus_fx',
      setupIntentRef: 'seti_fx',
      priceRef: 'price_fake_1',
      trialEndsAt: 1_900_000_000,
      attempt: 1,
    })

    assert.deepEqual(setupRetrieveCalls, ['seti_fx'])
    assert.equal(result.subscriptionRef, 'sub_fx')
    assert.isFalse(result.reused)
    assert.lengthOf(createCalls, 1)
  })

  test('SetupIntent inválido → CARD_NOT_CONFIRMED', async ({ assert }) => {
    const fakeStripe = {
      setupIntents: {
        retrieve: async () => ({
          id: 'seti_fx',
          status: 'requires_payment_method',
          customer: 'cus_fx',
          usage: 'off_session',
          payment_method: null,
          metadata: { valanserh_signup_draft_id: '1' },
        }),
      },
      customers: { update: async () => ({}) },
      subscriptions: { list: async () => ({ data: [] }) },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => fakeStripe)
    try {
      await adapter.createProviderSubscription({
        owner: { kind: 'signup_draft', signupDraftId: 1 },
        customerRef: 'cus_fx',
        setupIntentRef: 'seti_fx',
        priceRef: 'price_fake_1',
        trialEndsAt: 1_900_000_000,
        attempt: 1,
      })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.CARD_NOT_CONFIRMED
      )
    }
  })
})

test.group('StripeBillingProviderAdapter — webhooks (7579)', () => {
  test('verifyWebhookEvent: firma válida sobre bytes exactos', ({ assert }) => {
    const payload = subscriptionEventPayload()
    const adapter = new StripeBillingProviderAdapter(ENABLED_WITH_WEBHOOK)
    const verified = adapter.verifyWebhookEvent(payload, signPayload(payload))
    assert.equal(verified.id, 'evt_fixtureW2')
    assert.equal(verified.type, 'valanserh.fixture_processed')
    assert.equal(verified.object.subscriptionRef, 'sub_fixtureW1')
    assert.equal(verified.object.customerRef, 'cus_fixtureW1')
    assert.isFalse(verified.fromConnectedAccount)
  })

  test('sin cabecera → WEBHOOK_SIGNATURE_INVALID', ({ assert }) => {
    const adapter = new StripeBillingProviderAdapter(ENABLED_WITH_WEBHOOK)
    try {
      adapter.verifyWebhookEvent('{}', null)
      assert.fail('Debió lanzar')
    } catch (error) {
      const typed = assertProviderError(error)
      assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID)
      assert.equal(typed.httpStatus, 400)
    }
  })

  test('webhookSecret null → STRIPE_NOT_CONFIGURED', ({ assert }) => {
    const adapter = new StripeBillingProviderAdapter({
      ...ENABLED_WITH_WEBHOOK,
      webhookSecret: null,
    })
    try {
      adapter.verifyWebhookEvent('{}', 't=0,v1=x')
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED
      )
    }
  })

  test('livemode cruzado → WEBHOOK_MODE_MISMATCH', ({ assert }) => {
    const payload = subscriptionEventPayload({ livemode: true })
    const adapter = new StripeBillingProviderAdapter(ENABLED_WITH_WEBHOOK)
    try {
      adapter.verifyWebhookEvent(payload, signPayload(payload))
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.WEBHOOK_MODE_MISMATCH
      )
    }
  })
})

function invoiceFixtureRetrievePayload() {
  return {
    id: 'in_sim1',
    object: 'invoice' as const,
    status: 'draft' as const,
    billing_reason: 'subscription_cycle' as const,
    customer: 'cus_sim1',
    customer_email: 'prospecto.fixture@correo.test',
    customer_name: 'Fixture SA',
    currency: 'mxn',
    total: 0,
    auto_advance: true,
    parent: {
      type: 'subscription_details' as const,
      subscription_details: { subscription: 'sub_sim1', metadata: null },
      quote_details: null,
    },
    lines: { object: 'list' as const, data: [{ id: 'il_embedded' }], has_more: true },
  }
}

function buildSubscriptionItemLine(
  id: string,
  overrides: Record<string, unknown> = {}
): Stripe.InvoiceLineItem {
  return {
    id,
    object: 'line_item',
    amount: 0,
    currency: 'mxn',
    description: null,
    discount_amounts: null,
    discountable: true,
    discounts: [],
    invoice: 'in_sim1',
    livemode: false,
    metadata: {},
    period: { start: 1_790_000_000, end: 1_792_592_000 },
    pretax_credit_amounts: null,
    pricing: {
      type: 'price_details',
      price_details: { price: 'price_sim1', product: 'prod_sim1' },
      unit_amount_decimal: null,
    },
    parent: {
      type: 'subscription_item_details',
      subscription_item_details: {
        proration: false,
        subscription_item: 'si_sim1',
        invoice_item: null,
        subscription: 'sub_sim1',
        proration_details: null,
      },
      invoice_item_details: null,
    },
    quantity: 1,
    quantity_decimal: null,
    subscription: 'sub_sim1',
    subtotal: 0,
    taxes: null,
    ...overrides,
  } as Stripe.InvoiceLineItem
}

test.group('StripeBillingProviderAdapter — factura borrador (USRH1790718243208)', () => {
  test('CA-1: isBillingInvoiceProvider en manual, stripe y guardia incompleta', ({ assert }) => {
    const stripeAdapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS)
    assert.isFalse(isBillingInvoiceProvider(new ManualBillingProviderAdapter()))
    assert.isTrue(isBillingInvoiceProvider(stripeAdapter))

    const partial = {
      key: BILLING_PROVIDER_KEYS.STRIPE,
      openSubscription: stripeAdapter.openSubscription.bind(stripeAdapter),
      admitRecordedPayment: stripeAdapter.admitRecordedPayment.bind(stripeAdapter),
      readInvoice: async () => ({
        invoiceRef: 'in_x',
        status: 'draft' as const,
        billingReason: null,
        subscriptionRef: null,
        customerRef: 'cus_x',
        currency: 'mxn',
        totalCents: 0,
        autoAdvance: true,
        lines: [],
      }),
      addInvoiceCharge: async () => ({ externalId: 'ii_x' }),
      holdInvoice: async () => {},
    } as BillingProviderPort
    assert.isFalse(isBillingInvoiceProvider(partial))
  })

  test('CA-2: deshabilitado → STRIPE_NOT_CONFIGURED en las cuatro operaciones sin fábrica', async ({
    assert,
  }) => {
    let factoryCalled = false
    const adapter = new StripeBillingProviderAdapter(DISABLED_SETTINGS, () => {
      factoryCalled = true
      throw new Error('no debe invocarse')
    })

    const charge = {
      invoiceRef: 'in_sim1',
      customerRef: 'cus_sim1',
      billingSubscriptionId: 7,
      part: 'period' as const,
      amountCents: 100,
      currency: 'MXN',
      description: 'Fixture',
    }

    for (const call of [
      () => adapter.readInvoice('in_sim1'),
      () => adapter.addInvoiceCharge(charge),
      () => adapter.holdInvoice('in_sim1'),
      () => adapter.resumeInvoice('in_sim1'),
    ] as const) {
      try {
        await call()
        assert.fail('Debió lanzar')
      } catch (error) {
        const typed = assertProviderError(error)
        assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.STRIPE_NOT_CONFIGURED)
        assert.equal(typed.detail, BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL)
      }
    }
    assert.isFalse(factoryCalled)
  })

  test('CA-3: lectura paginada sin PII en el DTO', async ({ assert }) => {
    const listLineItemsCalls: Array<[string, { limit: number; starting_after?: string }]> = []
    const pageOne = Array.from({ length: 100 }, (_, index) =>
      buildSubscriptionItemLine(`il_page1_${index}`)
    )
    const pageTwo = [buildSubscriptionItemLine('il_page2_0')]

    const fakeStripe = {
      invoices: {
        retrieve: async (id: string) => {
          assert.equal(id, 'in_sim1')
          return invoiceFixtureRetrievePayload()
        },
        listLineItems: async (
          id: string,
          params: { limit: number; starting_after?: string }
        ) => {
          listLineItemsCalls.push([id, params])
          if (params.starting_after === undefined) {
            return { object: 'list', data: pageOne, has_more: true }
          }
          assert.equal(params.starting_after, 'il_page1_99')
          return { object: 'list', data: pageTwo, has_more: false }
        },
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => fakeStripe)
    const result = await adapter.readInvoice('in_sim1')

    assert.lengthOf(listLineItemsCalls, 2)
    assert.deepEqual(listLineItemsCalls[0], ['in_sim1', { limit: 100 }])
    assert.deepEqual(listLineItemsCalls[1], [
      'in_sim1',
      { limit: 100, starting_after: 'il_page1_99' },
    ])
    assert.lengthOf(result.lines, 101)
    assert.deepEqual(Object.keys(result).sort(), [
      'autoAdvance',
      'billingReason',
      'currency',
      'customerRef',
      'invoiceRef',
      'lines',
      'status',
      'subscriptionRef',
      'totalCents',
    ])
    assert.equal(result.subscriptionRef, 'sub_sim1')
    const serialized = JSON.stringify(result)
    assert.notInclude(serialized, 'prospecto.fixture@correo.test')
    assert.notInclude(serialized, 'Fixture SA')
  })

  test('CA-4: mapeo de líneas subscription_item, invoice_item y ajeno', async ({ assert }) => {
    const lineA = buildSubscriptionItemLine('il_a')
    const lineB = buildSubscriptionItemLine('il_b', {
      amount: 104_400,
      pricing: { type: 'price_details', price_details: null, unit_amount_decimal: null },
      parent: {
        type: 'invoice_item_details',
        invoice_item_details: {
          proration: false,
          invoice_item: 'ii_b',
          subscription: null,
          proration_details: null,
        },
        subscription_item_details: null,
      },
      metadata: {
        valanserh_invoice_part: 'period',
        valanserh_invoice_ref: 'in_sim1',
        valanserh_billing_subscription_id: '7',
      },
    })
    const lineC = buildSubscriptionItemLine('il_c', {
      parent: {
        type: 'subscription_item_details',
        subscription_item_details: {
          proration: true,
          subscription_item: 'si_c',
          invoice_item: null,
          subscription: 'sub_sim1',
          proration_details: null,
        },
        invoice_item_details: null,
      },
      metadata: { valanserh_invoice_part: 'otro' },
    })

    const fakeStripe = {
      invoices: {
        retrieve: async () => invoiceFixtureRetrievePayload(),
        listLineItems: async () => ({
          object: 'list',
          data: [lineA, lineB, lineC],
          has_more: false,
        }),
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => fakeStripe)
    const result = await adapter.readInvoice('in_sim1')

    assert.deepEqual(result.lines[0], {
      lineRef: 'il_a',
      amountCents: 0,
      source: 'subscription_item',
      priceRef: 'price_sim1',
      periodStart: 1_790_000_000,
      periodEnd: 1_792_592_000,
      proration: false,
      valanserhPart: null,
    })
    assert.deepEqual(result.lines[1], {
      lineRef: 'il_b',
      amountCents: 104_400,
      source: 'invoice_item',
      priceRef: null,
      periodStart: 1_790_000_000,
      periodEnd: 1_792_592_000,
      proration: false,
      valanserhPart: 'period',
    })
    assert.equal(result.lines[2]?.valanserhPart, null)
    assert.isTrue(result.lines[2]?.proration)
    for (const line of result.lines) {
      assert.deepEqual(Object.keys(line).sort(), [
        'amountCents',
        'lineRef',
        'periodEnd',
        'periodStart',
        'priceRef',
        'proration',
        'source',
        'valanserhPart',
      ])
    }
  })

  test('CA-5: forma inesperada → PROVIDER_REQUEST_FAILED con detail fijo', async ({ assert }) => {
    const fakeStripe = {
      invoices: {
        retrieve: async () => ({
          ...invoiceFixtureRetrievePayload(),
          customer: null,
        }),
        listLineItems: async () => ({ object: 'list', data: [], has_more: false }),
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => fakeStripe)
    try {
      await adapter.readInvoice('in_sim1')
      assert.fail('Debió lanzar')
    } catch (error) {
      const typed = assertProviderError(error)
      assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED)
      assert.equal(typed.detail, BILLING_PROVIDER_PROVIDER_REQUEST_FAILED_DETAIL)
    }
  })

  test('CA-6: addInvoiceCharge con parámetros e idempotency exactos', async ({ assert }) => {
    const createCalls: unknown[] = []
    const fakeStripe = {
      invoiceItems: {
        create: async (params: unknown, opts: unknown) => {
          createCalls.push([params, opts])
          return { id: 'ii_sim1' }
        },
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => fakeStripe)
    const draft = {
      invoiceRef: 'in_sim1',
      customerRef: 'cus_sim1',
      billingSubscriptionId: 7,
      part: 'period' as const,
      amountCents: 104_400,
      currency: 'MXN',
      description: 'Periodo 2026-10-01 a 2026-10-31 · 12 empleados',
    }

    const result = await adapter.addInvoiceCharge(draft)
    assert.equal(result.externalId, 'ii_sim1')
    assert.lengthOf(createCalls, 1)
    assert.deepEqual(createCalls[0], [
      buildInvoiceItemParams(draft),
      { idempotencyKey: invoiceChargeIdempotencyKey('in_sim1', 'period') },
    ])

    const increaseDraft = { ...draft, part: 'increase_debt' as const }
    await adapter.addInvoiceCharge(increaseDraft)
    assert.deepEqual(createCalls[1], [
      buildInvoiceItemParams(increaseDraft),
      { idempotencyKey: 'valanserh-invoice-in_sim1-increase_debt' },
    ])
  })

  test('CA-7: repetición usa la misma idempotencyKey', async ({ assert }) => {
    const keys: string[] = []
    const fakeStripe = {
      invoiceItems: {
        create: async (_params: unknown, opts: { idempotencyKey: string }) => {
          keys.push(opts.idempotencyKey)
          return { id: 'ii_sim1' }
        },
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => fakeStripe)
    const draft = {
      invoiceRef: 'in_sim1',
      customerRef: 'cus_sim1',
      billingSubscriptionId: 7,
      part: 'period' as const,
      amountCents: 104_400,
      currency: 'MXN',
      description: 'Fixture',
    }

    await adapter.addInvoiceCharge(draft)
    await adapter.addInvoiceCharge(draft)
    assert.deepEqual(keys, [
      'valanserh-invoice-in_sim1-period',
      'valanserh-invoice-in_sim1-period',
    ])
  })

  test('CA-8: referencias inválidas sin invocar al cliente', async ({ assert }) => {
    let factoryCalled = false
    const fakeStripe = {} as unknown as Stripe
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => {
      factoryCalled = true
      return fakeStripe
    })

    const charge = {
      invoiceRef: 'in_sim1',
      customerRef: 'cus_sim1',
      billingSubscriptionId: 7,
      part: 'period' as const,
      amountCents: 1,
      currency: 'MXN',
      description: 'Fixture',
    }

    for (const call of [
      () => adapter.readInvoice(''),
      () => adapter.readInvoice('sub_sim1'),
      () => adapter.readInvoice('in_sim1/lines'),
      () => adapter.addInvoiceCharge({ ...charge, invoiceRef: '  ' }),
      () => adapter.addInvoiceCharge({ ...charge, customerRef: 'bad' }),
      () => adapter.holdInvoice(''),
      () => adapter.resumeInvoice('sub_sim1'),
    ] as const) {
      try {
        await call()
        assert.fail('Debió lanzar')
      } catch (error) {
        assert.equal(
          assertProviderError(error).errorCode,
          BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED
        )
      }
    }
    assert.isFalse(factoryCalled)
  })

  test('CA-9: holdInvoice y resumeInvoice actualizan auto_advance', async ({ assert }) => {
    const updates: unknown[] = []
    const fakeStripe = {
      invoices: {
        update: async (id: string, params: unknown) => {
          updates.push([id, params])
          return { id }
        },
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => fakeStripe)
    await adapter.holdInvoice('in_sim1')
    await adapter.resumeInvoice('in_sim1')
    assert.deepEqual(updates, [
      ['in_sim1', { auto_advance: false }],
      ['in_sim1', { auto_advance: true }],
    ])
  })

  test('CA-10: errores del SDK en las cuatro operaciones sin filtrar texto de Stripe', async ({
    assert,
  }) => {
    const stripeError = new Stripe.errors.StripeInvalidRequestError({
      message: 'No such invoice; prospecto.fixture@correo.test',
      type: 'invalid_request_error',
      code: 'resource_missing',
      requestId: 'req_fixture2',
      statusCode: 404,
    })

    const charge = {
      invoiceRef: 'in_sim1',
      customerRef: 'cus_sim1',
      billingSubscriptionId: 7,
      part: 'period' as const,
      amountCents: 100,
      currency: 'MXN',
      description: 'Fixture',
    }

    for (const [buildClient, call] of [
      [
        () =>
          ({
            invoices: {
              retrieve: async () => {
                throw stripeError
              },
            },
          }) as unknown as Stripe,
        (adapter: StripeBillingProviderAdapter) => adapter.readInvoice('in_sim1'),
      ],
      [
        () =>
          ({
            invoiceItems: { create: async () => { throw stripeError } },
          }) as unknown as Stripe,
        (adapter: StripeBillingProviderAdapter) => adapter.addInvoiceCharge(charge),
      ],
      [
        () =>
          ({
            invoices: { update: async () => { throw stripeError } },
          }) as unknown as Stripe,
        (adapter: StripeBillingProviderAdapter) => adapter.holdInvoice('in_sim1'),
      ],
      [
        () =>
          ({
            invoices: { update: async () => { throw stripeError } },
          }) as unknown as Stripe,
        (adapter: StripeBillingProviderAdapter) => adapter.resumeInvoice('in_sim1'),
      ],
    ] as const) {
      const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, buildClient)
      try {
        await call(adapter)
        assert.fail('Debió lanzar')
      } catch (error) {
        const typed = assertProviderError(error)
        assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED)
        assert.equal(typed.detail, BILLING_PROVIDER_PROVIDER_REQUEST_FAILED_DETAIL)
        assert.notInclude(JSON.stringify(typed), 'prospecto.fixture@correo.test')
        assert.notInclude(typed.message, 'No such invoice')
      }
    }
  })
})

function paidInvoiceWithPaymentsFixture() {
  return {
    ...invoiceFixtureRetrievePayload(),
    status: 'paid' as const,
    amount_paid: 104_400,
    amount_paid_off_stripe: 0,
    status_transitions: { paid_at: 1_793_599_200 },
    payments: {
      object: 'list' as const,
      data: [
        {
          id: 'inpay_sim1',
          status: 'paid',
          payment: { type: 'payment_intent', payment_intent: 'pi_sim1' },
        },
      ],
      has_more: false,
    },
  }
}

test.group('StripeBillingProviderAdapter — lo pagado (USRH1790724549115 / CA-10, CA-11)', () => {
  test('CA-10: readInvoice con includePayments devuelve 13 llaves sin PII', async ({
    assert,
  }) => {
    let retrieveArgs: unknown[] = []
    const fakeStripe = {
      invoices: {
        retrieve: async (...args: unknown[]) => {
          retrieveArgs = args
          return paidInvoiceWithPaymentsFixture()
        },
        listLineItems: async () => ({
          object: 'list',
          data: [buildSubscriptionItemLine('il_a')],
          has_more: false,
        }),
      },
    } as unknown as Stripe

    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () => fakeStripe)
    const result = await adapter.readInvoice('in_sim1', { includePayments: true })

    assert.equal(retrieveArgs[0], 'in_sim1')
    const expand = (retrieveArgs[1] as { expand?: string[] })?.expand ?? []
    assert.includeMembers(expand, ['payments'])
    assert.isFalse(expand.some((entry) => entry.includes('.')))

    assert.deepEqual(Object.keys(result).sort(), [
      'amountPaidCents',
      'amountPaidOffStripeCents',
      'autoAdvance',
      'billingReason',
      'currency',
      'customerRef',
      'invoiceRef',
      'lines',
      'paidAt',
      'paymentIntentRef',
      'status',
      'subscriptionRef',
      'totalCents',
    ])
    assert.equal(result.amountPaidCents, 104_400)
    assert.equal(result.paidAt, 1_793_599_200)
    assert.equal(result.paymentIntentRef, 'pi_sim1')
    assert.equal(result.amountPaidOffStripeCents, 0)
    assert.notInclude(JSON.stringify(result), 'prospecto.fixture@correo.test')
    assert.notInclude(JSON.stringify(result), 'Fixture SA')

    retrieveArgs = []
    const baseOnly = await adapter.readInvoice('in_sim1')
    assert.lengthOf(Object.keys(baseOnly), 9)
    assert.lengthOf(retrieveArgs, 1)
  })

  test('CA-10: amount_paid_off_stripe ausente en Stripe se interpreta como 0', async ({
    assert,
  }) => {
    const fixture = paidInvoiceWithPaymentsFixture()
    const { amount_paid_off_stripe: offStripeAmount, ...withoutOffStripe } = fixture
    void offStripeAmount
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () =>
      ({
        invoices: {
          retrieve: async () => withoutOffStripe,
          listLineItems: async () => ({
            object: 'list',
            data: [buildSubscriptionItemLine('il_a')],
            has_more: false,
          }),
        },
      }) as unknown as Stripe
    )

    const result = await adapter.readInvoice('in_sim1', { includePayments: true })
    assert.equal(result.amountPaidOffStripeCents, 0)
  })

  test('CA-11: forma inesperada de lo pagado lanza PROVIDER_REQUEST_FAILED', async ({
    assert,
  }) => {
    const adapter = new StripeBillingProviderAdapter(ENABLED_SETTINGS, () =>
      ({
        invoices: {
          retrieve: async () => ({
            ...paidInvoiceWithPaymentsFixture(),
            amount_paid: 'bad',
          }),
          listLineItems: async () => ({
            object: 'list',
            data: [buildSubscriptionItemLine('il_a')],
            has_more: false,
          }),
        },
      }) as unknown as Stripe
    )

    try {
      await adapter.readInvoice('in_sim1', { includePayments: true })
      assert.fail('Debió lanzar')
    } catch (error) {
      assert.equal(
        assertProviderError(error).errorCode,
        BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED
      )
    }
  })
})

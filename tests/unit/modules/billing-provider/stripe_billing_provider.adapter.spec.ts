import { inspect } from 'node:util'
import { Writable } from 'node:stream'
import { test } from '@japa/runner'
import { pino } from 'pino'
import {
  BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL,
  BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL,
  BILLING_PROVIDER_ERROR_CODES,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import Stripe from 'stripe'
import StripeBillingProviderAdapter, {
  buildStripePriceParams,
  buildStripeProductParams,
  catalogIdempotencyKey,
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

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
import StripeBillingProviderAdapter from '#modules/billing-provider/stripe_billing_provider.adapter'
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

import { test } from '@japa/runner'
import {
  BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL,
  BILLING_PROVIDER_ERROR_CODES,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import {
  BILLING_PROVIDER_KEYS,
  type BillingProviderPort,
  type RecordedPaymentRequest,
  type SubscriptionOpening,
  type SubscriptionOpeningRequest,
} from '#modules/billing-provider/billing_provider.port'
import {
  billingProviderRegistry,
  resolveBillingProvider,
} from '#modules/billing-provider/billing_provider.registry'

class StripeProbeAdapter implements BillingProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE

  async openSubscription(_request: SubscriptionOpeningRequest): Promise<SubscriptionOpening> {
    return {
      provider: BILLING_PROVIDER_KEYS.STRIPE,
      externalCustomerRef: null,
      externalSubscriptionRef: null,
    }
  }

  async admitRecordedPayment(_request: RecordedPaymentRequest): Promise<void> {
    return undefined
  }
}

function assertAdapterNotRegistered(error: unknown) {
  if (!(error instanceof BillingProviderServiceError)) {
    throw new Error('Se esperaba BillingProviderServiceError')
  }
  return error
}

test.group('billingProviderRegistry — fail-closed (USRH1790708507467 / CA-6)', () => {
  test('resolve("manual") devuelve adaptador con key manual', ({ assert }) => {
    const adapter = resolveBillingProvider('manual')
    assert.equal(adapter.key, 'manual')
  })

  for (const key of ['', 'Manual', ' manual ', 'manual ', 'stripe', 'desconocido'] as const) {
    test(`resolve("${key}") lanza ADAPTER_NOT_REGISTERED`, ({ assert }) => {
      try {
        resolveBillingProvider(key)
        assert.fail('Debió lanzar')
      } catch (error) {
        const typed = assertAdapterNotRegistered(error)
        assert.equal(typed.errorCode, BILLING_PROVIDER_ERROR_CODES.ADAPTER_NOT_REGISTERED)
        assert.equal(typed.httpStatus, 500)
        assert.equal(typed.key, 'proveedor-de-cobro-no-soportado')
        assert.equal(typed.detail, BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL)
        assert.include(typed.message, 'Proveedor de cobro sin adaptador')
      }
    })
  }

  test('register restaura el adaptador anterior', ({ assert }) => {
    const restore = billingProviderRegistry.register(new StripeProbeAdapter())
    try {
      assert.equal(resolveBillingProvider('stripe').key, 'stripe')
    } finally {
      restore()
    }

    try {
      resolveBillingProvider('stripe')
      assert.fail('Debió lanzar tras restaurar')
    } catch (error) {
      assertAdapterNotRegistered(error)
    }
  })
})

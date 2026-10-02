import { test } from '@japa/runner'
import {
  BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL,
  BILLING_PROVIDER_ERROR_CODES,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import { resolveBillingProviderApiError } from '#helpers/billing_provider_api_error'
import { resolveAdditionalBusinessUnitApiError } from '#helpers/business_unit_signup_api_error'
import { resolveBillingSubscriptionApiError } from '#helpers/billing_subscription_api_error'

const ADAPTER_NOT_REGISTERED = new BillingProviderServiceError(
  'Proveedor de cobro sin adaptador: desconocido',
  BILLING_PROVIDER_ERROR_CODES.ADAPTER_NOT_REGISTERED,
  500,
  'proveedor-de-cobro-no-soportado',
  BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL
)

test.group('resolveBillingProviderApiError (USRH1790708507467 / CA-9)', () => {
  test('forma estable del catálogo', ({ assert }) => {
    const resolved = resolveBillingProviderApiError(ADAPTER_NOT_REGISTERED)
    assert.deepEqual(resolved, {
      title: 'Proveedor de cobro',
      detail: BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL,
      key: 'proveedor-de-cobro-no-soportado',
      code: 'PLT.PRV.ADAPTER_NOT_REGISTERED',
      status: 500,
    })
  })

  test('sin detail usa el texto fijo del catálogo, no error.message', ({ assert }) => {
    const error = new BillingProviderServiceError(
      'Proveedor de cobro sin adaptador: stripe',
      BILLING_PROVIDER_ERROR_CODES.ADAPTER_NOT_REGISTERED,
      500,
      'proveedor-de-cobro-no-soportado'
    )
    const resolved = resolveBillingProviderApiError(error)
    assert.equal(resolved.detail, BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL)
    assert.notEqual(resolved.detail, error.message)
  })

  test('delegación desde resolveBillingSubscriptionApiError', ({ assert }) => {
    const resolved = resolveBillingSubscriptionApiError(ADAPTER_NOT_REGISTERED)
    assert.equal(resolved.code, 'PLT.PRV.ADAPTER_NOT_REGISTERED')
    assert.equal(resolved.status, 500)
  })

  test('delegación desde resolveAdditionalBusinessUnitApiError', ({ assert }) => {
    const resolved = resolveAdditionalBusinessUnitApiError(ADAPTER_NOT_REGISTERED)
    assert.equal(resolved.code, 'PLT.PRV.ADAPTER_NOT_REGISTERED')
    assert.equal(resolved.status, 500)
    assert.equal(resolved.title, 'Proveedor de cobro')
  })
})

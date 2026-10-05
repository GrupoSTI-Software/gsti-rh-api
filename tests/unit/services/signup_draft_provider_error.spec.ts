import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import {
  BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL,
  BILLING_PROVIDER_ERROR_CODES,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import SignupDraftService from '#services/signup_draft_service'

function getI18nStub(): I18n {
  return {
    formatMessage: (key: string) => key,
    t: (key: string, _params?: unknown, fallback?: string) => fallback ?? key,
  } as unknown as I18n
}

test.group('SignupDraftService — BillingProviderServiceError (USRH1790708507467 / CA-5)', () => {
  test('toServiceResult expone PLT.PRV.ADAPTER_NOT_REGISTERED', async ({ assert }) => {
    const service = new SignupDraftService(getI18nStub())
    const error = new BillingProviderServiceError(
      'Proveedor de cobro sin adaptador: desconocido',
      BILLING_PROVIDER_ERROR_CODES.ADAPTER_NOT_REGISTERED,
      500,
      'proveedor-de-cobro-no-soportado',
      BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL
    )

    const result = (service as unknown as { toServiceResult: (e: unknown) => unknown }).toServiceResult(
      error
    ) as {
      status: number
      code?: string
      errorCode?: string
      key?: string
      detail?: string
    }

    assert.isNotNull(result)
    assert.equal(result!.status, 500)
    assert.equal(result!.code, 'PLT.PRV.ADAPTER_NOT_REGISTERED')
    assert.equal(result!.errorCode, 'PLT.PRV.ADAPTER_NOT_REGISTERED')
    assert.equal(result!.key, 'proveedor-de-cobro-no-soportado')
    assert.equal(result!.detail, BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL)
  })
})

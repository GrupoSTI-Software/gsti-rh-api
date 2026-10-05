import {
  BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'

export type ResolvedBillingProviderError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte BillingProviderServiceError en respuesta HTTP estable (USRH1790708507467).
 * Solo se invoca por delegación; no expone error.message al cliente.
 */
export function resolveBillingProviderApiError(
  error: BillingProviderServiceError
): ResolvedBillingProviderError {
  return {
    title: 'Proveedor de cobro',
    detail: error.detail ?? BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL,
    key: error.key ?? 'proveedor-de-cobro-no-soportado',
    code: error.errorCode,
    status: error.httpStatus,
  }
}

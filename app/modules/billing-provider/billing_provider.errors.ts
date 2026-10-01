import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL,
  BILLING_PROVIDER_PROVIDER_REQUEST_FAILED_DETAIL,
} from '#constants/billing_provider_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'

export function operationNotAvailable(operation: string): BillingProviderServiceError {
  return new BillingProviderServiceError(
    `Operación de cobro no disponible: ${operation}`,
    BILLING_PROVIDER_ERROR_CODES.OPERATION_NOT_AVAILABLE,
    500,
    'operacion-de-cobro-no-disponible',
    BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL
  )
}

export function providerRequestFailed(
  operation: string,
  info: { stripeErrorType: string | null; stripeRequestId: string | null }
): BillingProviderServiceError {
  const type = info.stripeErrorType ?? 'unknown'
  const requestId = info.stripeRequestId ?? 'unknown'
  return new BillingProviderServiceError(
    `Stripe ${operation} falló: ${type} (${requestId})`,
    BILLING_PROVIDER_ERROR_CODES.PROVIDER_REQUEST_FAILED,
    500,
    'fallo-del-proveedor-de-cobro',
    BILLING_PROVIDER_PROVIDER_REQUEST_FAILED_DETAIL
  )
}

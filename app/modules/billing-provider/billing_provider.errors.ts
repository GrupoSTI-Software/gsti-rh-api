import {
  BILLING_PROVIDER_ERROR_CODES,
  BILLING_PROVIDER_CARD_NOT_CONFIRMED_DETAIL,
  BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL,
  BILLING_PROVIDER_PROVIDER_REQUEST_FAILED_DETAIL,
  BILLING_PROVIDER_SUBSCRIPTION_OPENING_MISMATCH_DETAIL,
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

export function cardNotConfirmed(): BillingProviderServiceError {
  return new BillingProviderServiceError(
    'Tarjeta sin confirmar para la suscripción',
    BILLING_PROVIDER_ERROR_CODES.CARD_NOT_CONFIRMED,
    422,
    'tarjeta-no-confirmada',
    BILLING_PROVIDER_CARD_NOT_CONFIRMED_DETAIL
  )
}

export function subscriptionOpeningMismatch(): BillingProviderServiceError {
  return new BillingProviderServiceError(
    'Apertura de cobro inconsistente con el catálogo',
    BILLING_PROVIDER_ERROR_CODES.SUBSCRIPTION_OPENING_MISMATCH,
    500,
    'apertura-de-cobro-inconsistente',
    BILLING_PROVIDER_SUBSCRIPTION_OPENING_MISMATCH_DETAIL
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

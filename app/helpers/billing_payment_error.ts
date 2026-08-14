import { BILLING_PAYMENT_ERROR_CODES } from '../constants/billing_payment_error_codes.js'
import { BillingPaymentServiceError } from '../exceptions/billing_payment_service_error.js'

/** Falló aplicar el aumento pendiente durante el registro del pago. */
export function changeApplyFailedError(detail?: string): BillingPaymentServiceError {
  const message = detail ?? 'No se pudo aplicar el aumento de cantidad junto con el pago.'
  return new BillingPaymentServiceError(
    message,
    BILLING_PAYMENT_ERROR_CODES.CHANGE_APPLY_FAILED,
    500,
    'cambio-aplicacion-fallida',
    message
  )
}

/** Snapshot congelado del cambio con importes incompletos o no numéricos. */
export function changeInconsistentSnapshotError(detail?: string): BillingPaymentServiceError {
  const message =
    detail ??
    'Los importes congelados del cambio de suscripción están incompletos o son inválidos.'
  return new BillingPaymentServiceError(
    message,
    BILLING_PAYMENT_ERROR_CODES.CHANGE_INCONSISTENT_SNAPSHOT,
    500,
    'cambio-snapshot-inconsistente',
    message
  )
}

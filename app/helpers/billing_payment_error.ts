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

/**
 * Acuerdo de descuento congelado incoherente o desglose que no cuadra al
 * cobrar el periodo (USRH1787714804403, reglas 6 y 7).
 */
export function discountSnapshotInconsistentError(detail?: string): BillingPaymentServiceError {
  const message =
    detail ??
    'El acuerdo de descuento congelado de la suscripción está incompleto o el desglose no cuadra con el importe cobrado.'
  return new BillingPaymentServiceError(
    message,
    BILLING_PAYMENT_ERROR_CODES.DISCOUNT_SNAPSHOT_INCONSISTENT,
    500,
    'descuento-snapshot-inconsistente',
    message
  )
}

/**
 * El pago cubriría más periodos que los que le restan al beneficio del
 * código (USRH1787714804404, regla 11). `wouldCoverPeriods` y
 * `remainingBenefitPeriods` viajan en el `detail` para que el cliente vea
 * las cifras reales, igual que `PERIODS_OUT_OF_RANGE`.
 */
export function discountPeriodsExceededError(
  wouldCoverPeriods: number,
  remainingBenefitPeriods: number
): BillingPaymentServiceError {
  const message = `El pago cubriría ${wouldCoverPeriods} periodos y al descuento le queda ${remainingBenefitPeriods}. Esos periodos se cobran a precios distintos: regístralos por separado.`
  return new BillingPaymentServiceError(
    message,
    BILLING_PAYMENT_ERROR_CODES.DISCOUNT_PERIODS_EXCEEDED,
    422,
    'periodos-exceden-descuento',
    message
  )
}

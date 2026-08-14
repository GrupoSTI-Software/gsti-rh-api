import { BILLING_PAYMENT_ERROR_CODES } from '../constants/billing_payment_error_codes.js'
import { BillingPaymentServiceError } from '../exceptions/billing_payment_service_error.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'

export type ResolvedBillingPaymentError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
  data?: Record<string, number>
}

/**
 * Convierte excepciones del módulo de pagos en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo PLT.PAY.*.
 */
export function resolveBillingPaymentApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedBillingPaymentError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Pagos de suscripción',
      detail,
      key: 'PLT.PAY.VAL_INPUT',
      code: BILLING_PAYMENT_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof BillingPaymentServiceError) {
    return {
      title: 'Pagos de suscripción',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  if (error instanceof BillingSubscriptionServiceError) {
    const resolved: ResolvedBillingPaymentError = {
      title: 'Pagos de suscripción',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
    if (error.data) {
      resolved.data = error.data
    }
    return resolved
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en pagos.',
    key: BILLING_PAYMENT_ERROR_CODES.SYS_UNHANDLED,
    code: BILLING_PAYMENT_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}

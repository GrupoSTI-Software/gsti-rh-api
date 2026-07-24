import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'

export type ResolvedBillingSubscriptionError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones del módulo de suscripciones en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo PLT.SUB.*.
 */
export function resolveBillingSubscriptionApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedBillingSubscriptionError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Suscripciones',
      detail,
      key: 'PLT.SUB.VAL_INPUT',
      code: BILLING_SUBSCRIPTION_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof BillingSubscriptionServiceError) {
    return {
      title: 'Suscripciones',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en suscripciones.',
    key: BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED,
    code: BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}

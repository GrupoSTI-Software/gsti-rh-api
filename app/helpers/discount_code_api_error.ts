import { DISCOUNT_CODE_ERROR_CODES } from '../constants/discount_code_error_codes.js'
import { DiscountCodeServiceError } from '../exceptions/discount_code_service_error.js'

export type ResolvedDiscountCodeError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones del catálogo de códigos de descuento en la respuesta
 * HTTP estable `{ title, detail, key, code }` con prefijo PLT.DSC.*.
 *
 * A diferencia del helper espejado (`resolveBillingSubscriptionApiError`),
 * aquí `key` es siempre un slug kebab en español y `code` es siempre el
 * `PLT.DSC.*` punteado — nunca se mezclan (desviación deliberada, Anexo B).
 */
export function resolveDiscountCodeApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedDiscountCodeError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Códigos de descuento',
      detail,
      key: 'datos-invalidos',
      code: DISCOUNT_CODE_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof DiscountCodeServiceError) {
    return {
      title: 'Códigos de descuento',
      detail: error.detail ?? error.message,
      key: error.key ?? 'error-inesperado',
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en códigos de descuento.',
    key: 'error-inesperado',
    code: DISCOUNT_CODE_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}

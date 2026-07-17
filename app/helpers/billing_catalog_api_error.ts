import { BILLING_CATALOG_ERROR_CODES } from '../constants/billing_catalog_error_codes.js'
import { BillingCatalogServiceError } from '../exceptions/billing_catalog_service_error.js'

export type ResolvedBillingCatalogError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones del catálogo de cobro en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo PLT.CAT.*.
 */
export function resolveBillingCatalogApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedBillingCatalogError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Catálogo de cobro',
      detail,
      key: 'PLT.CAT.VAL_INPUT',
      code: BILLING_CATALOG_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof BillingCatalogServiceError) {
    return {
      title: 'Catálogo de cobro',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en el catálogo.',
    key: BILLING_CATALOG_ERROR_CODES.SYS_UNHANDLED,
    code: BILLING_CATALOG_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}

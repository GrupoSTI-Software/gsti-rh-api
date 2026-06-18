import { ETR_ERROR_CODES } from '../constants/traumatic_event_report_error_codes.js'
import { TraumaticEventReportError } from '../exceptions/traumatic_event_report_error.js'
import type { EtrErrorCode } from '../constants/traumatic_event_report_error_codes.js'

export type ResolvedTraumaticEventReportApiError = {
  message: string
  status: number
  errorCode: EtrErrorCode
  key?: string
}

/**
 * Convierte excepciones del módulo de reportes de evento traumático en una
 * respuesta estable (mensaje, status HTTP, errorCode y key opcional).
 * Cualquier error desconocido cae a `fallbackStatus` con `SYS_UNHANDLED`.
 */
export function resolveTraumaticEventReportApiError(
  error: unknown,
  fallbackStatus: number
): ResolvedTraumaticEventReportApiError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const msg =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : 'Error de validación')
    return {
      message: msg,
      status: 400,
      errorCode: ETR_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof TraumaticEventReportError) {
    return {
      message: error.message,
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
    }
  }

  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    status: fallbackStatus,
    errorCode: ETR_ERROR_CODES.SYS_UNHANDLED,
  }
}

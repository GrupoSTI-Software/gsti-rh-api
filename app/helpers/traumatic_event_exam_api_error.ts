import { TEX_ERROR_CODES } from '../constants/traumatic_event_exam_error_codes.js'
import { TraumaticEventExamError } from '../exceptions/traumatic_event_exam_error.js'
import { TraumaticEventReportError } from '../exceptions/traumatic_event_report_error.js'
import { RetentionGuardError } from '../exceptions/retention_guard_error.js'

export type ResolvedTraumaticEventExamApiError = {
  message: string
  status: number
  code: string
  key?: string
  detail?: string
}

/**
 * Convierte excepciones del módulo de exámenes en una respuesta estable
 * (mensaje, status HTTP, `code` y `key` opcional).
 *
 * Mapea tres familias:
 *  - Validación VineJS → `TEX.VAL.001`.
 *  - `TraumaticEventExamError` → su propio `code`/`key`/status.
 *  - `TraumaticEventReportError` (scope del padre, p. ej. reporte fuera de alcance)
 *    → se reexpone su `errorCode` como `code`.
 *  - Cualquier otro error → `fallbackStatus` con `TEX.SYS.001`.
 */
export function resolveTraumaticEventExamApiError(
  error: unknown,
  fallbackStatus: number
): ResolvedTraumaticEventExamApiError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const msg =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : 'Error de validación')
    return { message: msg, status: 400, code: TEX_ERROR_CODES.VAL_INPUT }
  }

  if (error instanceof TraumaticEventExamError) {
    return {
      message: error.message,
      status: error.httpStatus,
      code: error.code,
      key: error.key,
    }
  }

  if (error instanceof TraumaticEventReportError) {
    return {
      message: error.message,
      status: error.httpStatus,
      code: error.errorCode,
      key: error.key,
    }
  }

  if (error instanceof RetentionGuardError) {
    return {
      message: error.message,
      status: error.httpStatus,
      code: error.errorCode,
      key: error.key,
      detail: error.detail,
    }
  }

  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    status: fallbackStatus,
    code: TEX_ERROR_CODES.SYS_UNHANDLED,
  }
}

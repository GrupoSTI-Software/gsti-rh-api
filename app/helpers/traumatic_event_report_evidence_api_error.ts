import { TERE_ERROR_CODES } from '../constants/traumatic_event_report_evidence_error_codes.js'
import { TraumaticEventReportEvidenceError } from '../exceptions/traumatic_event_report_evidence_error.js'
import { TraumaticEventReportError } from '../exceptions/traumatic_event_report_error.js'

export type ResolvedTraumaticEventReportEvidenceApiError = {
  message: string
  status: number
  code: string
  key?: string
}

/**
 * Convierte excepciones del módulo de evidencias en una respuesta estable.
 *
 * Mapea tres familias:
 *  - Validación VineJS → `TERE.VAL.001`.
 *  - `TraumaticEventReportEvidenceError` → su propio `code`/`key`/status.
 *  - `TraumaticEventReportError` (scope del padre, 404 reporte fuera de scope)
 *    → reexpone su `errorCode` como `code` (ETR.NF.REPORT.001).
 *  - Cualquier otro error → `fallbackStatus` con `TERE.SYS.001`.
 */
export function resolveTraumaticEventReportEvidenceApiError(
  error: unknown,
  fallbackStatus: number
): ResolvedTraumaticEventReportEvidenceApiError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const msg =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : 'Error de validación')
    return { message: msg, status: 400, code: TERE_ERROR_CODES.VAL_INPUT }
  }

  if (error instanceof TraumaticEventReportEvidenceError) {
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

  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    status: fallbackStatus,
    code: TERE_ERROR_CODES.SYS_UNHANDLED,
  }
}

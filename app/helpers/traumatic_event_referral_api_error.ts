import { TREF_ERROR_CODES } from '../constants/traumatic_event_referral_error_codes.js'
import { TraumaticEventReferralError } from '../exceptions/traumatic_event_referral_error.js'
import { TraumaticEventReportError } from '../exceptions/traumatic_event_report_error.js'

export type ResolvedTraumaticEventReferralApiError = {
  message: string
  status: number
  code: string
  key?: string
}

/**
 * Convierte excepciones del módulo de canalizaciones en una respuesta estable
 * (mensaje, status HTTP, `code` y `key` opcional).
 *
 * Mapea tres familias:
 *  - Validación VineJS → `TREF.VAL.001`.
 *  - `TraumaticEventReferralError` → su propio `code`/`key`/status.
 *  - `TraumaticEventReportError` (heredado del scope del padre, p. ej. reporte
 *    fuera de alcance → `ETR.NF.REPORT.001`) → se reexpone su `errorCode` como `code`.
 *  - Cualquier otro error → `fallbackStatus` con `TREF.SYS.001`.
 */
export function resolveTraumaticEventReferralApiError(
  error: unknown,
  fallbackStatus: number
): ResolvedTraumaticEventReferralApiError {
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
      code: TREF_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof TraumaticEventReferralError) {
    return {
      message: error.message,
      status: error.httpStatus,
      code: error.code,
      key: error.key,
    }
  }

  // Errores heredados del servicio del reporte (scope/no-encontrado): se reexpone
  // su errorCode (ETR.*) bajo el campo `code` del contrato de este módulo.
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
    code: TREF_ERROR_CODES.SYS_UNHANDLED,
  }
}

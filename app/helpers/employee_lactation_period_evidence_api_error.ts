import { ELPE_ERROR_CODES } from '../constants/employee_lactation_period_evidence_error_codes.js'
import { EmployeeLactationPeriodEvidenceError } from '../exceptions/employee_lactation_period_evidence_error.js'
import type { ElpeErrorCode } from '../constants/employee_lactation_period_evidence_error_codes.js'

export type ResolvedEmployeeLactationPeriodEvidenceApiError = {
  message: string
  status: number
  errorCode: ElpeErrorCode
  key?: string
}

/**
 * Convierte excepciones del módulo de evidencias en una respuesta estable
 * (mensaje, status HTTP, errorCode y key opcional para que el frontend reaccione).
 *
 * Cualquier error desconocido cae a `fallbackStatus` con `SYS_UNHANDLED`.
 */
export function resolveEmployeeLactationPeriodEvidenceApiError(
  error: unknown,
  fallbackStatus: number
): ResolvedEmployeeLactationPeriodEvidenceApiError {
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
      errorCode: ELPE_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof EmployeeLactationPeriodEvidenceError) {
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
    errorCode: ELPE_ERROR_CODES.SYS_UNHANDLED,
  }
}

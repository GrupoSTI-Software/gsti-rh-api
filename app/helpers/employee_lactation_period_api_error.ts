import { ELP_ERROR_CODES } from '../constants/employee_lactation_period_error_codes.js'
import { EmployeeLactationPeriodError } from '../exceptions/employee_lactation_period_error.js'
import type { ElpErrorCode } from '../constants/employee_lactation_period_error_codes.js'

export type ResolvedEmployeeLactationPeriodApiError = {
  message: string
  status: number
  errorCode: ElpErrorCode
  key?: string
}

/**
 * Convierte excepciones del módulo de periodos de lactancia en una respuesta estable
 * (mensaje, status HTTP, errorCode y key opcional para que el frontend reaccione).
 *
 * Cualquier error desconocido cae a `fallbackStatus` con `SYS_UNHANDLED`.
 */
export function resolveEmployeeLactationPeriodApiError(
  error: unknown,
  fallbackStatus: number
): ResolvedEmployeeLactationPeriodApiError {
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
      errorCode: ELP_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof EmployeeLactationPeriodError) {
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
    errorCode: ELP_ERROR_CODES.SYS_UNHANDLED,
  }
}

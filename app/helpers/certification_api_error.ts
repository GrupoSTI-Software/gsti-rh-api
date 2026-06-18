import { CERTIFICATION_ERROR_CODES } from '../constants/certification_error_codes.js'
import { CertificationServiceError } from '../exceptions/certification_service_error.js'
import type { CertificationErrorCode } from '../constants/certification_error_codes.js'

export type ResolvedCertificationApiError = {
  message: string
  status: number
  errorCode: CertificationErrorCode
}

/**
 * Convierte excepciones del módulo de certificaciones en mensaje HTTP, status y errorCode estable.
 */
export function resolveCertificationApiError(
  error: unknown,
  fallbackStatus: number
): ResolvedCertificationApiError {
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
      errorCode: CERTIFICATION_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof CertificationServiceError) {
    return {
      message: error.message,
      status: error.httpStatus,
      errorCode: error.errorCode,
    }
  }

  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    status: fallbackStatus,
    errorCode: CERTIFICATION_ERROR_CODES.SYS_UNHANDLED,
  }
}

import { PCR_ERROR_CODES } from '../constants/position_certification_requirement_error_codes.js'
import { PositionCertificationRequirementError } from '../exceptions/position_certification_requirement_error.js'
import type { PcrErrorCode } from '../constants/position_certification_requirement_error_codes.js'

export type ResolvedPcrError = {
  message: string
  status: number
  errorCode: PcrErrorCode
}

export function resolvePcrApiError(error: unknown, fallbackStatus: number): ResolvedPcrError {
  const err = error as { code?: string; message?: string; messages?: Array<{ message?: string }> }

  if (err?.code === 'E_VALIDATION_ERROR') {
    return {
      message: err.messages?.[0]?.message ?? err.message ?? 'Error de validación',
      status: 400,
      errorCode: PCR_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof PositionCertificationRequirementError) {
    return {
      message: error.message,
      status: error.httpStatus,
      errorCode: error.errorCode,
    }
  }

  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    status: fallbackStatus,
    errorCode: PCR_ERROR_CODES.SYS_UNHANDLED,
  }
}

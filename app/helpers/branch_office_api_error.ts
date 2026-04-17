import { BRANCH_OFFICE_ERROR_CODES } from '../constants/branch_office_error_codes.js'
import { BranchOfficeServiceError } from '../exceptions/branch_office_service_error.js'
import type { BranchOfficeErrorCode } from '../constants/branch_office_error_codes.js'

export type ResolvedBranchOfficeError = {
  message: string
  status: number
  errorCode: BranchOfficeErrorCode
}

/**
 * Convierte excepciones del módulo de sucursales en mensaje HTTP, status y errorCode estable.
 * El cliente puede usar `errorCode` con un mapa fijo sin inspeccionar el texto del mensaje.
 */
export function resolveBranchOfficeApiError(error: unknown, fallbackStatus: number): ResolvedBranchOfficeError {
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
      errorCode: BRANCH_OFFICE_ERROR_CODES.VAL_INPUT,
    }
  }

  if (err?.code === 'E_ROW_NOT_FOUND') {
    return {
      message:
        typeof err.message === 'string'
          ? err.message
          : 'Sucursal no encontrada o no disponible para esta instancia del sistema',
      status: 404,
      errorCode: BRANCH_OFFICE_ERROR_CODES.NOT_FOUND,
    }
  }

  if (error instanceof BranchOfficeServiceError) {
    return {
      message: error.message,
      status: error.httpStatus,
      errorCode: error.errorCode,
    }
  }

  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    status: fallbackStatus,
    errorCode: BRANCH_OFFICE_ERROR_CODES.SYS_UNHANDLED,
  }
}

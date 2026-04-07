import type { BranchOfficeErrorCode } from '../constants/branch_office_error_codes.js'

/**
 * Error de dominio del servicio de sucursales con código HTTP y errorCode para el cliente.
 */
export class BranchOfficeServiceError extends Error {
  readonly errorCode: BranchOfficeErrorCode
  readonly httpStatus: number

  constructor(message: string, errorCode: BranchOfficeErrorCode, httpStatus: number = 400) {
    super(message)
    this.name = 'BranchOfficeServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
  }
}

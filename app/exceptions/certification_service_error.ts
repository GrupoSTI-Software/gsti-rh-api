import type { CertificationErrorCode } from '../constants/certification_error_codes.js'

/**
 * Error de dominio para el catálogo de certificaciones (HTTP estable + errorCode cliente).
 */
export class CertificationServiceError extends Error {
  readonly errorCode: CertificationErrorCode
  readonly httpStatus: number

  constructor(
    message: string,
    errorCode: CertificationErrorCode,
    httpStatus: number = 400
  ) {
    super(message)
    this.name = 'CertificationServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
  }
}

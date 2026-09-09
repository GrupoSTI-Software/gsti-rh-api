import type { AllianceErrorCode } from '../constants/alliance_error_codes.js'

/**
 * Error de dominio de alianzas comerciales con código HTTP y errorCode estable.
 * Tipada contra la unión del catálogo: un `code` fuera de `PLT.ALL.*` no compila.
 */
export class AllianceServiceError extends Error {
  readonly errorCode: AllianceErrorCode
  readonly httpStatus: number
  readonly key: string
  readonly detail: string

  constructor(
    message: string,
    errorCode: AllianceErrorCode,
    httpStatus: number,
    key: string,
    detail: string
  ) {
    super(message)
    this.name = 'AllianceServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

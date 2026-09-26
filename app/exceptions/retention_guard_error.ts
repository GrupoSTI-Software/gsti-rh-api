import type { RetentionGuardErrorCode } from '../constants/retention_guard_error_codes.js'

/**
 * Error lanzado por RetentionGuardService cuando un borrado está bloqueado
 * por la política de retención activa de la empresa.
 *
 * `detail` lleva la fecha ISO hasta la que el registro está protegido,
 * o la lista de IDs ofensores en borrados en lote.
 */
export class RetentionGuardError extends Error {
  readonly errorCode: RetentionGuardErrorCode
  readonly httpStatus: number
  readonly key: string
  readonly detail: string

  constructor(
    message: string,
    errorCode: RetentionGuardErrorCode,
    httpStatus: number,
    key: string,
    detail: string
  ) {
    super(message)
    this.name = 'RetentionGuardError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

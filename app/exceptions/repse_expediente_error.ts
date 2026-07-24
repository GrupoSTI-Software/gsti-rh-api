import type { RepseExpedienteErrorCode } from '../constants/repse_expediente_error_codes.js'

/**
 * Excepción de dominio del expediente documental REPSE por proveedor.
 */
export class RepseExpedienteError extends Error {
  readonly errorCode: RepseExpedienteErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: RepseExpedienteErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'RepseExpedienteError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

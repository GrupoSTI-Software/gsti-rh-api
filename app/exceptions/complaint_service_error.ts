import type { ComplaintErrorCode } from '../constants/complaint_error_codes.js'

/**
 * Error de dominio del módulo de quejas con código HTTP y errorCode para el cliente.
 */
export class ComplaintServiceError extends Error {
  readonly errorCode: ComplaintErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  /** Clave i18n en `resources/langs/*.json` para el mensaje traducido. */
  readonly messageKey?: string

  constructor(
    message: string,
    errorCode: ComplaintErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string,
    messageKey?: string
  ) {
    super(message)
    this.name = 'ComplaintServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.messageKey = messageKey
  }
}

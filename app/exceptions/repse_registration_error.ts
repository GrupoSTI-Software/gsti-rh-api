import type { RepseErrorCode } from '../constants/repse_registration_error_codes.js'

/**
 * Excepción de dominio del módulo Repse.
 *
 * Lleva consigo el código estable, el HTTP status sugerido y, opcionalmente,
 * la `key` que el frontend usa para mostrar mensajes específicos
 * (folio-repse-ya-registrado, empresa-no-encontrada, etc.).
 */
export class RepseRegistrationError extends Error {
  readonly errorCode: RepseErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(
    message: string,
    errorCode: RepseErrorCode,
    httpStatus: number = 400,
    key?: string
  ) {
    super(message)
    this.name = 'RepseRegistrationError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

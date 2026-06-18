import type { RepseSpecializedServiceErrorCode } from '../constants/repse_specialized_service_error_codes.js'

/**
 * Excepción de dominio del módulo de servicios especializados REPSE.
 *
 * Lleva consigo el código estable, el HTTP status sugerido y, opcionalmente,
 * la `key` que el frontend usa para mostrar mensajes específicos
 * (registro-repse-no-encontrado, servicio-no-encontrado, etc.).
 */
export class RepseSpecializedServiceError extends Error {
  readonly errorCode: RepseSpecializedServiceErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(
    message: string,
    errorCode: RepseSpecializedServiceErrorCode,
    httpStatus: number = 400,
    key?: string
  ) {
    super(message)
    this.name = 'RepseSpecializedServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

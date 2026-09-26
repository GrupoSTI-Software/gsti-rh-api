import type { RegulatoryFrameworkErrorCode } from '#constants/regulatory_framework_error_codes'

/**
 * Error de dominio del módulo de consulta del marco regulatorio
 * (USRH1785167064404). Espejo de `ComplaintServiceError`.
 */
export class RegulatoryFrameworkError extends Error {
  readonly errorCode: RegulatoryFrameworkErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  /** Clave i18n en `resources/langs/*.json` para el título traducido. */
  readonly messageKey?: string

  constructor(
    message: string,
    errorCode: RegulatoryFrameworkErrorCode,
    httpStatus: number = 404,
    key?: string,
    detail?: string,
    messageKey?: string
  ) {
    super(message)
    this.name = 'RegulatoryFrameworkError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.messageKey = messageKey
  }

  /**
   * Crea un error cuyo mensaje/título se resuelve vía i18n
   * (`resources/langs/*.json`). El servicio/repository no debe hardcodear
   * textos de cara al cliente; la traducción ocurre en el controller.
   */
  static withMessageKey(
    messageKey: string,
    errorCode: RegulatoryFrameworkErrorCode,
    httpStatus: number,
    key: string,
    detail: string
  ): RegulatoryFrameworkError {
    return new RegulatoryFrameworkError(messageKey, errorCode, httpStatus, key, detail, messageKey)
  }
}

import type { TeleworkComplianceSettingErrorCode } from '#constants/telework_compliance_setting_error_codes'

/**
 * Error de dominio del servicio de ajustes de teletrabajo (VLRH-H1791306074375).
 *
 * Espejo de `RetentionPolicyServiceError` más una propiedad `field` (nombre del
 * campo del body que falló) y la fábrica `withField`, que fija status 422. Así el
 * 422 de validación viaja con `data: { field }` sin acoplar el dominio al HTTP.
 */
export class TeleworkComplianceSettingServiceError extends Error {
  readonly errorCode: TeleworkComplianceSettingErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  readonly messageKey?: string
  /** Campo del body que originó el error de validación (422). */
  readonly field?: string

  constructor(
    message: string,
    errorCode: TeleworkComplianceSettingErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string,
    messageKey?: string,
    field?: string
  ) {
    super(message)
    this.name = 'TeleworkComplianceSettingServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.messageKey = messageKey
    this.field = field
  }

  static withMessageKey(
    messageKey: string,
    errorCode: TeleworkComplianceSettingErrorCode,
    httpStatus: number,
    key?: string
  ): TeleworkComplianceSettingServiceError {
    return new TeleworkComplianceSettingServiceError(
      messageKey,
      errorCode,
      httpStatus,
      key,
      undefined,
      messageKey
    )
  }

  /**
   * Error de validación por campo: status 422, `key` (slug kebab), `messageKey`
   * i18n y `field` para que el controlador pinte `data: { field }`.
   */
  static withField(
    messageKey: string,
    errorCode: TeleworkComplianceSettingErrorCode,
    key: string,
    field: string
  ): TeleworkComplianceSettingServiceError {
    return new TeleworkComplianceSettingServiceError(
      messageKey,
      errorCode,
      422,
      key,
      undefined,
      messageKey,
      field
    )
  }
}

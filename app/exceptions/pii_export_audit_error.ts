import type { PiiExportErrorCode } from '../constants/pii_export_error_codes.js'

/**
 * Excepción de dominio para exportaciones con datos sensibles.
 * Transporta código estable `SEC.EXP.*` y clave i18n para la respuesta API.
 */
export class PiiExportAuditError extends Error {
  readonly errorCode: PiiExportErrorCode
  readonly httpStatus: number
  readonly key: string

  constructor(message: string, errorCode: PiiExportErrorCode, httpStatus: number, key: string) {
    super(message)
    this.name = 'PiiExportAuditError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

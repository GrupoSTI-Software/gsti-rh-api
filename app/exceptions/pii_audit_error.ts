import type { PiiAuditErrorCode } from '../constants/pii_audit_error_codes.js'

/**
 * Excepción de dominio para consulta de la bitácora de accesos a datos sensibles.
 * Transporta código estable `SEC.AUD.*` y clave i18n para la respuesta API.
 */
export class PiiAuditError extends Error {
  readonly errorCode: PiiAuditErrorCode
  readonly httpStatus: number
  readonly key: string

  constructor(message: string, errorCode: PiiAuditErrorCode, httpStatus: number, key: string) {
    super(message)
    this.name = 'PiiAuditError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

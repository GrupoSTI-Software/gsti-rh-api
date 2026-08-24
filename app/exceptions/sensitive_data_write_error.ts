import type { LegalCategory } from '#constants/sensitive_fields'
import type { SensitiveDataWriteErrorCode } from '#constants/sensitive_data_write_error_codes'

/**
 * Excepción de dominio: transición de dato sensible no autorizada.
 * Prohibido incluir el valor intentado o el guardado en `message`.
 */
export class SensitiveDataWriteError extends Error {
  readonly errorCode: SensitiveDataWriteErrorCode
  readonly httpStatus: number = 403
  readonly category?: LegalCategory

  constructor(errorCode: SensitiveDataWriteErrorCode, category?: LegalCategory) {
    super('Sensitive data write denied')
    this.name = 'SensitiveDataWriteError'
    this.errorCode = errorCode
    this.category = category
  }
}

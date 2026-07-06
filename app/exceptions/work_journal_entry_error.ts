import type { WjeErrorCode } from '../constants/work_journal_entry_error_codes.js'

/**
 * Excepción de dominio del módulo de registro electrónico de jornada.
 * Lleva el `code` estable, el HTTP status sugerido, el `key` kebab-case para
 * i18n del cliente y un `detail` opcional legible.
 *
 * Espeja la firma de `VersionContratoEspecializadoError`.
 */
export class WorkJournalEntryError extends Error {
  readonly code: WjeErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    code: WjeErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'WorkJournalEntryError'
    this.code = code
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

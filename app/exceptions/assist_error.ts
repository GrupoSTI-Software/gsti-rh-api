import type { AssistErrorCode } from '#constants/assist_error_codes'

/**
 * Excepción de dominio de checadas. Espeja `WorkJournalEntryError`.
 */
export class AssistError extends Error {
  readonly code: AssistErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    code: AssistErrorCode,
    httpStatus: number = 422,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'AssistError'
    this.code = code
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

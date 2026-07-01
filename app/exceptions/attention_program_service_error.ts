import type { AttentionProgramErrorCode } from '#constants/attention_program_error_codes'

export class AttentionProgramServiceError extends Error {
  readonly errorCode: AttentionProgramErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  readonly messageKey?: string

  constructor(
    message: string,
    errorCode: AttentionProgramErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string,
    messageKey?: string
  ) {
    super(message)
    this.name = 'AttentionProgramServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.messageKey = messageKey
  }
}

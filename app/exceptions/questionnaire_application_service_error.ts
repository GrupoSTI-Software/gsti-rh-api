import type { QuestionnaireApplicationErrorCode } from '../constants/questionnaire_application_error_codes.js'

export class QuestionnaireApplicationServiceError extends Error {
  readonly errorCode: QuestionnaireApplicationErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  readonly messageKey?: string

  constructor(
    message: string,
    errorCode: QuestionnaireApplicationErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string,
    messageKey?: string
  ) {
    super(message)
    this.name = 'QuestionnaireApplicationServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.messageKey = messageKey
  }
}

import type { Nom035TabulationErrorCode } from '../constants/nom035_tabulation_error_codes.js'

export class QuestionnaireTabulationServiceError extends Error {
  readonly errorCode: Nom035TabulationErrorCode
  readonly httpStatus: number

  constructor(message: string, errorCode: Nom035TabulationErrorCode, httpStatus: number = 400) {
    super(message)
    this.name = 'QuestionnaireTabulationServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
  }
}

import type { QuestionnaireApplicabilityErrorCode } from '../constants/questionnaire_applicability_error_codes.js'

/**
 * Error de dominio del servicio de aplicabilidad NOM-035 con código HTTP y errorCode para el cliente.
 */
export class QuestionnaireApplicabilityServiceError extends Error {
  readonly errorCode: QuestionnaireApplicabilityErrorCode
  readonly httpStatus: number

  constructor(
    message: string,
    errorCode: QuestionnaireApplicabilityErrorCode,
    httpStatus: number = 400
  ) {
    super(message)
    this.name = 'QuestionnaireApplicabilityServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
  }
}

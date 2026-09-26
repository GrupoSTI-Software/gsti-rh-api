import type { I18n } from '@adonisjs/i18n'
import {
  QUESTIONNAIRE_APPLICABILITY_ERROR_CODES,
} from '../constants/questionnaire_applicability_error_codes.js'
import { QuestionnaireApplicabilityServiceError } from '../exceptions/questionnaire_applicability_service_error.js'
import type { QuestionnaireApplicabilityErrorCode } from '../constants/questionnaire_applicability_error_codes.js'

export type ResolvedQuestionnaireApplicabilityError = {
  message: string
  status: number
  errorCode: QuestionnaireApplicabilityErrorCode
}

/**
 * Convierte excepciones del módulo de aplicabilidad NOM-035 en mensaje HTTP, status y errorCode estable.
 */
export function resolveQuestionnaireApplicabilityApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedQuestionnaireApplicabilityError {
  const err = error as {
    status?: number
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const msg =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : 'Error de validación')
    return {
      message: msg,
      status: 400,
      errorCode: QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof QuestionnaireApplicabilityServiceError) {
    return {
      message: error.message,
      status: error.httpStatus,
      errorCode: error.errorCode,
    }
  }

  if (err?.status === 403) {
    return {
      message:
        i18n?.formatMessage('nom035.questionnaire_applicability.forbidden') ?? 'Sin permisos',
      status: 403,
      errorCode: QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.FORBIDDEN,
    }
  }

  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    status: fallbackStatus,
    errorCode: QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.SYS_UNHANDLED,
  }
}

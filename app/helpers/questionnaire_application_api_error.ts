import type { I18n } from '@adonisjs/i18n'
import {
  QUESTIONNAIRE_APPLICATION_ERROR_CODES,
  type QuestionnaireApplicationErrorCode,
} from '#constants/questionnaire_application_error_codes'
import { QuestionnaireApplicationServiceError } from '#exceptions/questionnaire_application_service_error'

export type ResolvedQuestionnaireApplicationError = {
  message: string
  title: string
  status: number
  errorCode: QuestionnaireApplicationErrorCode | string
  key?: string
  detail?: string
}

function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) return fallback
  const translated = i18n.formatMessage(key)
  return translated === key ? fallback : translated
}

function resolveMessageKey(error: QuestionnaireApplicationServiceError): string | undefined {
  if (error.messageKey) {
    return error.messageKey
  }

  const byErrorCode: Partial<Record<QuestionnaireApplicationErrorCode, string>> = {
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.VAL_INPUT]: 'nom035.questionnaire_application.val_input',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_APPLICABLE]:
      'nom035.questionnaire_application.not_applicable',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_FOUND_BRANCH]:
      'nom035.questionnaire_application.branch_not_found',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.ALREADY_OPEN]:
      'nom035.questionnaire_application.already_open',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.FORBIDDEN]: 'nom035.questionnaire_application.forbidden',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_FOUND]: 'nom035.questionnaire_application.not_found',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.ALREADY_CLOSED]:
      'nom035.questionnaire_application.already_closed',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_IN_PROGRESS]:
      'nom035.questionnaire_application.not_in_progress',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.HAS_RESPONSES]:
      'nom035.questionnaire_application.has_responses',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.INCOMPLETE_ANSWERS]:
      'nom035.questionnaire_application.incomplete_answers',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.INVALID_ANSWER_OPTION]:
      'nom035.questionnaire_application.invalid_answer_option',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.APPLICATION_CLOSED]:
      'nom035.questionnaire_application.application_closed',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.ALREADY_ANSWERED]:
      'nom035.questionnaire_application.already_answered',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.TARGET_NOT_FOUND]:
      'nom035.questionnaire_application.target_not_found',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.FOLIO_GENERATION_FAILED]:
      'nom035.questionnaire_application.folio_generation_failed',
    [QUESTIONNAIRE_APPLICATION_ERROR_CODES.SYS_UNHANDLED]:
      'an_unexpected_error_has_occurred_on_the_server',
  }

  return byErrorCode[error.errorCode]
}

export function resolveQuestionnaireApplicationApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedQuestionnaireApplicationError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  const title = translate(i18n, 'nom035.questionnaire_application.title', 'Aplicación NOM-035')

  if (err?.code === 'E_VALIDATION_ERROR') {
    const message =
      err.messages?.[0]?.message ??
      translate(i18n, 'nom035.questionnaire_application.val_input', 'Datos inválidos')
    return {
      message,
      title,
      status: 400,
      errorCode: QUESTIONNAIRE_APPLICATION_ERROR_CODES.VAL_INPUT,
      key: 'datos-invalidos',
      detail: message,
    }
  }

  if (error instanceof QuestionnaireApplicationServiceError) {
    const messageKey = resolveMessageKey(error)
    const message = messageKey ? translate(i18n, messageKey, error.message) : error.message
    return {
      message,
      title,
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      detail: error.detail ?? message,
    }
  }

  return {
    message:
      typeof err?.message === 'string'
        ? err.message
        : translate(i18n, 'an_unexpected_error_has_occurred_on_the_server', 'Error inesperado'),
    title: translate(i18n, 'server_error', 'Error del servidor'),
    status: fallbackStatus,
    errorCode: QUESTIONNAIRE_APPLICATION_ERROR_CODES.SYS_UNHANDLED,
  }
}

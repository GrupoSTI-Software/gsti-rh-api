import type { I18n } from '@adonisjs/i18n'
import {
  NOM035_TABULATION_ERROR_CODES,
  type Nom035TabulationErrorCode,
} from '../constants/nom035_tabulation_error_codes.js'
import { QuestionnaireTabulationServiceError } from '../exceptions/questionnaire_tabulation_service_error.js'

export type ResolvedQuestionnaireTabulationError = {
  message: string
  status: number
  errorCode: Nom035TabulationErrorCode
}

export function resolveQuestionnaireTabulationApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedQuestionnaireTabulationError {
  const err = error as {
    status?: number
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    return {
      message:
        err.messages?.[0]?.message ??
        (typeof err.message === 'string'
          ? err.message
          : i18n?.formatMessage('nom035.questionnaire_tabulation.val_input') ?? 'Datos inválidos'),
      status: 400,
      errorCode: NOM035_TABULATION_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof QuestionnaireTabulationServiceError) {
    return {
      message: error.message,
      status: error.httpStatus,
      errorCode: error.errorCode,
    }
  }

  if (err?.status === 403) {
    return {
      message:
        i18n?.formatMessage('nom035.questionnaire_tabulation.forbidden') ?? 'Sin permisos',
      status: 403,
      errorCode: NOM035_TABULATION_ERROR_CODES.FORBIDDEN,
    }
  }

  return {
    message:
      typeof err?.message === 'string'
        ? err.message
        : i18n?.formatMessage('nom035.questionnaire_tabulation.sys_unhandled') ??
          'Error inesperado',
    status: fallbackStatus,
    errorCode: NOM035_TABULATION_ERROR_CODES.SYS_UNHANDLED,
  }
}

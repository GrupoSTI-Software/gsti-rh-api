import type { I18n } from '@adonisjs/i18n'
import {
  ATTENTION_PROGRAM_ERROR_CODES,
  type AttentionProgramErrorCode,
} from '#constants/attention_program_error_codes'
import { AttentionProgramServiceError } from '#exceptions/attention_program_service_error'

export type ResolvedAttentionProgramError = {
  message: string
  title: string
  status: number
  errorCode: AttentionProgramErrorCode | string
  key?: string
  detail?: string
}

function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) return fallback
  const translated = i18n.formatMessage(key)
  return translated === key ? fallback : translated
}

function resolveMessageKey(error: AttentionProgramServiceError): string | undefined {
  if (error.messageKey) return error.messageKey

  const byErrorCode: Partial<Record<AttentionProgramErrorCode, string>> = {
    [ATTENTION_PROGRAM_ERROR_CODES.VAL_INPUT]: 'nom035.attention_program.val_input',
    [ATTENTION_PROGRAM_ERROR_CODES.ALREADY_OPEN]: 'nom035.attention_program.already_open',
    [ATTENTION_PROGRAM_ERROR_CODES.NOT_FOUND_ORIGIN]: 'nom035.attention_program.not_found_origin',
    [ATTENTION_PROGRAM_ERROR_CODES.NOT_FOUND_PROGRAM]: 'nom035.attention_program.not_found_program',
    [ATTENTION_PROGRAM_ERROR_CODES.FORBIDDEN]: 'nom035.attention_program.forbidden',
    [ATTENTION_PROGRAM_ERROR_CODES.SYS_UNHANDLED]: 'an_unexpected_error_has_occurred_on_the_server',
  }

  return byErrorCode[error.errorCode]
}

export function resolveAttentionProgramApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedAttentionProgramError {
  const err = error as { code?: string; message?: string; messages?: Array<{ message?: string }> }
  const title = translate(i18n, 'nom035.attention_program.title', 'Programa de atención NOM-035')

  if (err?.code === 'E_VALIDATION_ERROR') {
    const message =
      err.messages?.[0]?.message ??
      translate(i18n, 'nom035.attention_program.val_input', 'Datos inválidos')
    return {
      message,
      title,
      status: 400,
      errorCode: ATTENTION_PROGRAM_ERROR_CODES.VAL_INPUT,
      key: 'datos-invalidos',
      detail: message,
    }
  }

  if (error instanceof AttentionProgramServiceError) {
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
    errorCode: ATTENTION_PROGRAM_ERROR_CODES.SYS_UNHANDLED,
  }
}

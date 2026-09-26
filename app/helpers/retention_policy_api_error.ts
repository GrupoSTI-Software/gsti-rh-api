import type { I18n } from '@adonisjs/i18n'
import {
  RETENTION_POLICY_ERROR_CODES,
  type RetentionPolicyErrorCode,
} from '#constants/retention_policy_error_codes'
import { RetentionPolicyServiceError } from '#exceptions/retention_policy_service_error'

export type ResolvedRetentionPolicyError = {
  message: string
  title: string
  status: number
  errorCode: RetentionPolicyErrorCode | string
  key?: string
  detail?: string
}

function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) return fallback
  const translated = i18n.formatMessage(key)
  return translated === key ? fallback : translated
}

function resolveMessageKey(error: RetentionPolicyServiceError): string | undefined {
  if (error.messageKey) return error.messageKey

  const byErrorCode: Partial<Record<RetentionPolicyErrorCode, string>> = {
    [RETENTION_POLICY_ERROR_CODES.VAL_INPUT]: 'nom035.retention_policy.val_input',
    [RETENTION_POLICY_ERROR_CODES.INVALID_PERIOD]: 'nom035.retention_policy.invalid_period',
    [RETENTION_POLICY_ERROR_CODES.INVALID_EVIDENCE_TYPE]: 'nom035.retention_policy.invalid_evidence_type',
    [RETENTION_POLICY_ERROR_CODES.FORBIDDEN_SCOPE]: 'nom035.retention_policy.forbidden_scope',
    [RETENTION_POLICY_ERROR_CODES.SYS_UNHANDLED]: 'an_unexpected_error_has_occurred_on_the_server',
  }

  return byErrorCode[error.errorCode]
}

export function resolveRetentionPolicyApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedRetentionPolicyError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  const title = translate(i18n, 'nom035.retention_policy.title', 'Política de retención NOM-035')

  if (err?.code === 'E_VALIDATION_ERROR') {
    const message =
      err.messages?.[0]?.message ??
      translate(i18n, 'nom035.retention_policy.val_input', 'Datos inválidos')
    return {
      message,
      title,
      status: 400,
      errorCode: RETENTION_POLICY_ERROR_CODES.VAL_INPUT,
      key: 'NOM035.RET.VAL_INPUT',
      detail: message,
    }
  }

  if (error instanceof RetentionPolicyServiceError) {
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
    errorCode: RETENTION_POLICY_ERROR_CODES.SYS_UNHANDLED,
  }
}

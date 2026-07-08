import type { I18n } from '@adonisjs/i18n'
import { PII_AUDIT_ERROR_CODES, type PiiAuditErrorCode } from '#constants/pii_audit_error_codes'
import { PiiAuditError } from '#exceptions/pii_audit_error'

export type ResolvedPiiAuditError = {
  message: string
  title: string
  status: number
  errorCode: PiiAuditErrorCode | string
  key?: string
  detail?: string
}

function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) return fallback
  const translated = i18n.formatMessage(key)
  return translated === key ? fallback : translated
}

function resolveMessageKey(error: PiiAuditError): string | undefined {
  const byErrorCode: Partial<Record<PiiAuditErrorCode, string>> = {
    [PII_AUDIT_ERROR_CODES.VAL_INPUT]: 'pii_audit_val_input',
    [PII_AUDIT_ERROR_CODES.VAL_DATE_RANGE]: 'rango-fechas-invalido',
    [PII_AUDIT_ERROR_CODES.FORBIDDEN]: 'consulta-bitacora-denegada',
  }

  return byErrorCode[error.errorCode]
}

export function resolvePiiAuditApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedPiiAuditError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  const title = translate(i18n, 'pii_audit_title', 'Bitácora de accesos a datos sensibles')

  if (err?.code === 'E_VALIDATION_ERROR') {
    const message =
      err.messages?.[0]?.message ??
      translate(i18n, 'pii_audit_val_input', 'Los parámetros de consulta son inválidos.')
    return {
      message,
      title,
      status: 400,
      errorCode: PII_AUDIT_ERROR_CODES.VAL_INPUT,
      key: 'pii_audit_val_input',
      detail: message,
    }
  }

  if (error instanceof PiiAuditError) {
    const messageKey = resolveMessageKey(error)
    const message = messageKey ? translate(i18n, messageKey, error.message) : error.message
    return {
      message,
      title,
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      detail: message,
    }
  }

  return {
    message:
      typeof err?.message === 'string'
        ? err.message
        : translate(i18n, 'an_unexpected_error_has_occurred_on_the_server', 'Error inesperado'),
    title: translate(i18n, 'server_error', 'Error del servidor'),
    status: fallbackStatus,
    errorCode: PII_AUDIT_ERROR_CODES.VAL_INPUT,
  }
}

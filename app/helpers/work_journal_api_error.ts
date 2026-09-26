import type { I18n } from '@adonisjs/i18n'
import { WJE_ERROR_CODES } from '#constants/work_journal_entry_error_codes'
import type { WjeErrorCode } from '#constants/work_journal_entry_error_codes'
import { WorkJournalEntryError } from '#exceptions/work_journal_entry_error'

export type ResolvedWorkJournalApiError = {
  message: string
  title: string
  status: number
  code: WjeErrorCode | string
  key?: string
  detail?: string
}

/** Base de clave i18n por código de error: `${base}_title` / `${base}_message`. */
const ERROR_CODE_TO_I18N_BASE: Partial<Record<WjeErrorCode, string>> = {
  [WJE_ERROR_CODES.VAL_INPUT]: 'work_journal_val_input',
  [WJE_ERROR_CODES.NOT_FOUND]: 'work_journal_not_found',
  [WJE_ERROR_CODES.IMMUTABLE]: 'work_journal_immutable',
  [WJE_ERROR_CODES.PERIOD_WITHOUT_DATA]: 'work_journal_period_without_data',
  [WJE_ERROR_CODES.INTEGRITY_INVALID]: 'work_journal_integrity_invalid',
  [WJE_ERROR_CODES.FORBIDDEN]: 'work_journal_forbidden',
  [WJE_ERROR_CODES.SEAL_SECRET_MISSING]: 'work_journal_seal_secret_missing',
  [WJE_ERROR_CODES.SYS_UNHANDLED]: 'work_journal_unexpected_error',
}

function resolveMessageKey(code: string): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[code as WjeErrorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(code: string): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[code as WjeErrorCode]
  return base ? `${base}_title` : undefined
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones del módulo de registro electrónico de jornada en una
 * respuesta HTTP estable para el cliente, traduciendo título/mensaje vía i18n
 * (es/en) según el `code` del dominio. Espeja `resolveVersionContratoApiError`.
 */
export function resolveWorkJournalApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedWorkJournalApiError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const rawMessage =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : 'Error de validación')
    return {
      message: translate(
        i18n,
        'work_journal_val_input_message',
        'El rango del periodo es inválido.'
      ),
      title: translate(i18n, 'work_journal_val_input_title', 'Parámetros inválidos'),
      status: 422,
      code: WJE_ERROR_CODES.VAL_INPUT,
      key: 'rango-invalido',
      detail: rawMessage,
    }
  }

  if (error instanceof WorkJournalEntryError) {
    const message = translate(i18n, resolveMessageKey(error.code), error.detail ?? error.message)
    return {
      message,
      title: translate(i18n, resolveTitleKey(error.code), error.message),
      status: error.httpStatus,
      code: error.code,
      key: error.key,
      detail: message,
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(i18n, 'work_journal_unexpected_error_message', fallbackMessage),
    title: translate(i18n, 'work_journal_unexpected_error_title', 'Error'),
    status: fallbackStatus,
    code: WJE_ERROR_CODES.SYS_UNHANDLED,
    key: 'error-no-clasificado',
  }
}

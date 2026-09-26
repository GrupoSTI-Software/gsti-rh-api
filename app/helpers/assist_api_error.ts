import type { I18n } from '@adonisjs/i18n'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import type { AssistErrorCode } from '#constants/assist_error_codes'
import { AssistError } from '#exceptions/assist_error'

export type ResolvedAssistApiError = {
  message: string
  title: string
  status: number
  code: AssistErrorCode | string
  key?: string
  detail?: string
}

const ERROR_CODE_TO_I18N_BASE: Partial<Record<AssistErrorCode, string>> = {
  [ASSIST_ERROR_CODES.TENANT_UNRESOLVED]: 'assist_tenant_unresolved',
  [ASSIST_ERROR_CODES.CONFLICT_DUPLICATE]: 'assist_duplicate_natural_key',
}

function resolveMessageKey(code: string): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[code as AssistErrorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(code: string): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[code as AssistErrorCode]
  return base ? `${base}_title` : undefined
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/** Convierte `AssistError` en respuesta HTTP estable con i18n es/en. */
export function resolveAssistApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedAssistApiError {
  if (error instanceof AssistError) {
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

  const err = error as { message?: string }
  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: fallbackMessage,
    title: translate(i18n, 'unknown_error', 'Error'),
    status: fallbackStatus,
    code: 'AST.SYS.001',
  }
}

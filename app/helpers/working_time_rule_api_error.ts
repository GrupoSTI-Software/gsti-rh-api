import type { I18n } from '@adonisjs/i18n'
import WorkingTimeRuleError from '#exceptions/working_time_rule_error'
import type { WorkingTimeRuleErrorKey } from '#exceptions/working_time_rule_error'

export type ResolvedWorkingTimeRuleApiError = {
  message: string
  title: string
  status: number
  key: WorkingTimeRuleErrorKey | string
  detail?: string
}

/** Base de clave i18n por key de dominio: `${base}_title` / `${base}_message`. */
const ERROR_KEY_TO_I18N_BASE: Record<WorkingTimeRuleErrorKey, string> = {
  'vigencia-solapada': 'working_time_rule_vigencia_solapada',
  'valores-invalidos': 'working_time_rule_valores_invalidos',
  'override-excede-federal': 'working_time_rule_override_excede_federal',
  'valor-fuera-de-rango': 'working_time_rule_valor_fuera_de_rango',
  'jornada-no-resuelta': 'working_time_rule_jornada_no_resuelta',
}

const ERROR_KEY_STATUS: Record<WorkingTimeRuleErrorKey, number> = {
  'vigencia-solapada': 409,
  'valores-invalidos': 422,
  'override-excede-federal': 422,
  'valor-fuera-de-rango': 422,
  'jornada-no-resuelta': 404,
}

function resolveMessageKey(key: WorkingTimeRuleErrorKey): string {
  return `${ERROR_KEY_TO_I18N_BASE[key]}_message`
}

function resolveTitleKey(key: WorkingTimeRuleErrorKey): string {
  return `${ERROR_KEY_TO_I18N_BASE[key]}_title`
}

function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) {
    return fallback
  }
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones de reglas de jornada en una respuesta HTTP estable,
 * traduciendo título y mensaje vía i18n (es/en) según la key del dominio.
 */
export function resolveWorkingTimeRuleApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedWorkingTimeRuleApiError {
  if (error instanceof WorkingTimeRuleError) {
    const message = translate(i18n, resolveMessageKey(error.key), error.detail)
    const title = translate(i18n, resolveTitleKey(error.key), error.title)
    return {
      message,
      title,
      status: ERROR_KEY_STATUS[error.key] ?? fallbackStatus,
      key: error.key,
      detail: message,
    }
  }

  const fallbackMessage =
    error instanceof Error ? error.message : 'Ocurrió un error inesperado en el servidor.'
  return {
    message: translate(
      i18n,
      'working_time_rule_unexpected_error_message',
      fallbackMessage
    ),
    title: translate(i18n, 'working_time_rule_unexpected_error_title', 'Error del servidor'),
    status: fallbackStatus,
    key: 'error-no-clasificado',
    detail: fallbackMessage,
  }
}

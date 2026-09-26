import type { I18n } from '@adonisjs/i18n'
import { REPSE_PROVIDER_ERROR_CODES } from '../constants/repse_provider_error_codes.js'
import { RepseProviderError } from '../exceptions/repse_provider_error.js'
import type { RepseProviderErrorCode } from '../constants/repse_provider_error_codes.js'

export type ResolvedRepseProviderApiError = {
  /** Mensaje localizado según `Accept-Language` (o literal si no hay i18n). */
  message: string
  /** Título localizado del error. */
  title: string
  status: number
  errorCode: RepseProviderErrorCode
  key?: string
}

/**
 * Mapa `errorCode` → claves base de i18n. El resolver concatena `_title` y
 * `_message` para resolver el título y el mensaje localizados. Mismo patrón
 * que `repse_registration_api_error.ts`.
 */
const ERROR_CODE_TO_I18N_BASE: Record<RepseProviderErrorCode, string> = {
  [REPSE_PROVIDER_ERROR_CODES.VAL_INPUT]: 'repse_provider_val_input',
  [REPSE_PROVIDER_ERROR_CODES.DATE_INVALID]: 'repse_provider_date_invalid',
  [REPSE_PROVIDER_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND]: 'repse_provider_business_unit_not_found',
  [REPSE_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND]: 'repse_provider_not_found',
  [REPSE_PROVIDER_ERROR_CODES.VALIDATION_NOT_FOUND]: 'repse_provider_validation_not_found',
  [REPSE_PROVIDER_ERROR_CODES.FOLIO_DUPLICATE]: 'repse_provider_folio_duplicate',
  [REPSE_PROVIDER_ERROR_CODES.VAL_EVIDENCE]: 'repse_provider_validation_evidence_invalid',
  [REPSE_PROVIDER_ERROR_CODES.FORBIDDEN]: 'repse_provider_unauthorized',
  [REPSE_PROVIDER_ERROR_CODES.SYS_UNHANDLED]: 'repse_provider_unexpected_error',
}

function resolveMessageKey(errorCode: RepseProviderErrorCode, key?: string): string | undefined {
  if (errorCode === REPSE_PROVIDER_ERROR_CODES.VAL_EVIDENCE && key) {
    return `repse_provider_validation_evidence_${key.replace(/-/g, '_')}_message`
  }
  if (
    errorCode === REPSE_PROVIDER_ERROR_CODES.DATE_INVALID &&
    key &&
    key !== 'fecha-invalida'
  ) {
    return `repse_provider_date_invalid_${key.replace(/-/g, '_')}_message`
  }
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: RepseProviderErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_title` : undefined
}

/** Traduce una clave si `i18n` está disponible; si no, devuelve el fallback. */
function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones del módulo "Proveedores REPSE" en una respuesta HTTP
 * estable (mensaje, título, status, errorCode y key opcional).
 */
export function resolveRepseProviderApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedRepseProviderApiError {
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
      message: rawMessage,
      title: translate(i18n, 'repse_provider_val_input_title', 'Datos inválidos'),
      status: 422,
      errorCode: REPSE_PROVIDER_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof RepseProviderError) {
    let resolvedKey = error.key
    if (
      resolvedKey &&
      [
        'evidencia-faltante',
        'evidencia-tipo-invalido',
        'evidencia-tamano-excedido',
        'evidencia-no-disponible',
      ].includes(resolvedKey)
    ) {
      resolvedKey = 'evidencia-invalida'
    }
    return {
      message: translate(i18n, resolveMessageKey(error.errorCode, error.key), error.message),
      title: translate(i18n, resolveTitleKey(error.errorCode), 'Error'),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: resolvedKey,
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(i18n, 'repse_provider_unexpected_error_message', fallbackMessage),
    title: translate(i18n, 'repse_provider_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: REPSE_PROVIDER_ERROR_CODES.SYS_UNHANDLED,
  }
}

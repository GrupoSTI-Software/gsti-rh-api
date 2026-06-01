import type { I18n } from '@adonisjs/i18n'
import { REPSE_ERROR_CODES } from '../constants/repse_registration_error_codes.js'
import { RepseRegistrationError } from '../exceptions/repse_registration_error.js'
import type { RepseErrorCode } from '../constants/repse_registration_error_codes.js'

export type ResolvedRepseRegistrationApiError = {
  /** Mensaje localizado según `Accept-Language` (o literal si no hay i18n). */
  message: string
  /** Título localizado del error. */
  title: string
  status: number
  errorCode: RepseErrorCode
  key?: string
}

/**
 * Mapa `errorCode` → claves base de i18n. El resolver concatena
 * `_title` y `_message` para resolver el título y el mensaje localizados.
 *
 * Se separa por `errorCode` (estable) en lugar de por el campo `key`
 * (kebab-case del dominio) porque ya forma parte del contrato público.
 */
const ERROR_CODE_TO_I18N_BASE: Record<RepseErrorCode, string> = {
  [REPSE_ERROR_CODES.VAL_INPUT]: 'repse_val_input',
  [REPSE_ERROR_CODES.DATE_RANGE_INVALID]: 'repse_dates_range_invalid',
  [REPSE_ERROR_CODES.DATE_FORMAT_INVALID]: 'repse_dates_invalid',
  [REPSE_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND]: 'repse_business_unit_not_found',
  [REPSE_ERROR_CODES.REPSE_NOT_FOUND]: 'repse_not_found',
  [REPSE_ERROR_CODES.FOLIO_DUPLICATE]: 'repse_folio_duplicate',
  [REPSE_ERROR_CODES.FORBIDDEN]: 'repse_unauthorized',
  [REPSE_ERROR_CODES.SYS_UNHANDLED]: 'repse_unexpected_error',
}

/**
 * Resuelve la clave i18n del mensaje para el `errorCode` dado.
 *
 * Casos especiales:
 * - `DATE_RANGE_INVALID` no tiene clave `_title` propia; reusa la del
 *   `DATE_FORMAT_INVALID` (mismo escenario funcional "Fechas inválidas").
 */
function resolveMessageKey(errorCode: RepseErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  if (!base) return undefined
  if (errorCode === REPSE_ERROR_CODES.DATE_RANGE_INVALID) {
    return 'repse_dates_range_invalid_message'
  }
  return `${base}_message`
}

function resolveTitleKey(errorCode: RepseErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  if (!base) return undefined
  if (errorCode === REPSE_ERROR_CODES.DATE_RANGE_INVALID) {
    return 'repse_dates_invalid_title'
  }
  return `${base}_title`
}

/** Traduce una clave si `i18n` está disponible; si no, devuelve el fallback. */
function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones del módulo REPSE en una respuesta HTTP estable
 * (mensaje, título, status, errorCode y key opcional).
 *
 * Si se proporciona `i18n`, los textos respetan el `Accept-Language`; si
 * la clave no existe en los archivos de idioma, se cae al literal en
 * español de la propia excepción.
 */
export function resolveRepseRegistrationApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedRepseRegistrationApiError {
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
      title: translate(i18n, 'repse_val_input_title', 'Datos inválidos'),
      status: 400,
      errorCode: REPSE_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof RepseRegistrationError) {
    return {
      message: translate(i18n, resolveMessageKey(error.errorCode), error.message),
      title: translate(i18n, resolveTitleKey(error.errorCode), 'Error'),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(i18n, 'repse_unexpected_error_message', fallbackMessage),
    title: translate(i18n, 'repse_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: REPSE_ERROR_CODES.SYS_UNHANDLED,
  }
}

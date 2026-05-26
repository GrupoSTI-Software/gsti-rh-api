import type { I18n } from '@adonisjs/i18n'
import { REPSE_SPECIALIZED_SERVICE_ERROR_CODES } from '../constants/repse_specialized_service_error_codes.js'
import { RepseSpecializedServiceError } from '../exceptions/repse_specialized_service_error.js'
import { RepseRegistrationError } from '../exceptions/repse_registration_error.js'
import { REPSE_ERROR_CODES } from '../constants/repse_registration_error_codes.js'
import type { RepseSpecializedServiceErrorCode } from '../constants/repse_specialized_service_error_codes.js'

export type ResolvedRepseSpecializedServiceApiError = {
  /** Mensaje localizado según `Accept-Language` (o literal si no hay i18n). */
  message: string
  /** Título localizado del error. */
  title: string
  status: number
  errorCode: string
  key?: string
}

/**
 * Mapa `errorCode` → claves base de i18n. El resolver concatena
 * `_title` y `_message` para resolver el título y el mensaje localizados.
 */
const ERROR_CODE_TO_I18N_BASE: Record<RepseSpecializedServiceErrorCode, string> = {
  [REPSE_SPECIALIZED_SERVICE_ERROR_CODES.VAL_INPUT]: 'repse_specialized_service_val_input',
  [REPSE_SPECIALIZED_SERVICE_ERROR_CODES.SVC_NOT_FOUND]: 'repse_specialized_service_not_found',
  [REPSE_SPECIALIZED_SERVICE_ERROR_CODES.PARENT_NOT_FOUND]:
    'repse_specialized_service_parent_not_found',
  [REPSE_SPECIALIZED_SERVICE_ERROR_CODES.NAME_DUPLICATE]:
    'repse_specialized_service_name_duplicate',
  [REPSE_SPECIALIZED_SERVICE_ERROR_CODES.FORBIDDEN]: 'repse_specialized_service_unauthorized',
  [REPSE_SPECIALIZED_SERVICE_ERROR_CODES.SYS_UNHANDLED]:
    'repse_specialized_service_unexpected_error',
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

function resolveSpecializedKeys(errorCode: RepseSpecializedServiceErrorCode) {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return {
    title: base ? `${base}_title` : undefined,
    message: base ? `${base}_message` : undefined,
  }
}

/**
 * Convierte excepciones del módulo de servicios especializados REPSE en una
 * respuesta HTTP estable (mensaje, título, status, errorCode y key opcional).
 *
 * También entiende las excepciones del módulo padre (`RepseRegistrationError`)
 * cuando el tenant scope lanza el 404 de "registro REPSE no encontrado",
 * para que el catálogo hijo entregue el contrato esperado por la HU.
 */
export function resolveRepseSpecializedServiceApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedRepseSpecializedServiceApiError {
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
      title: translate(
        i18n,
        'repse_specialized_service_val_input_title',
        'Datos inválidos'
      ),
      status: 400,
      errorCode: REPSE_SPECIALIZED_SERVICE_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof RepseSpecializedServiceError) {
    const keys = resolveSpecializedKeys(error.errorCode)
    return {
      message: translate(i18n, keys.message, error.message),
      title: translate(i18n, keys.title, 'Error'),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
    }
  }

  if (error instanceof RepseRegistrationError) {
    if (error.errorCode === REPSE_ERROR_CODES.REPSE_NOT_FOUND) {
      const keys = resolveSpecializedKeys(
        REPSE_SPECIALIZED_SERVICE_ERROR_CODES.PARENT_NOT_FOUND
      )
      return {
        message: translate(i18n, keys.message, error.message),
        title: translate(i18n, keys.title, 'Registro REPSE no encontrado'),
        status: error.httpStatus,
        errorCode: REPSE_SPECIALIZED_SERVICE_ERROR_CODES.PARENT_NOT_FOUND,
        key: error.key,
      }
    }
    return {
      message: error.message,
      title: translate(i18n, 'repse_specialized_service_error_default_title', 'Error'),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(
      i18n,
      'repse_specialized_service_unexpected_error_message',
      fallbackMessage
    ),
    title: translate(i18n, 'repse_specialized_service_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: REPSE_SPECIALIZED_SERVICE_ERROR_CODES.SYS_UNHANDLED,
  }
}

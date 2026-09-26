import type { I18n } from '@adonisjs/i18n'
import { EMPLOYEE_BADGE_ERROR_CODES } from '../constants/employee_badge_error_codes.js'
import { EmployeeBadgeError } from '../exceptions/employee_badge_error.js'
import type { EmployeeBadgeErrorCode } from '../constants/employee_badge_error_codes.js'

export type ResolvedEmployeeBadgeApiError = {
  /** Mensaje localizado según `Accept-Language` (o literal si no hay i18n). */
  message: string
  /** Título localizado del error. */
  title: string
  status: number
  errorCode: EmployeeBadgeErrorCode
  key?: string
}

/**
 * Mapa `errorCode` → claves base de i18n. El resolver concatena `_title` y
 * `_message` para resolver el título y el mensaje localizados. Mismo patrón
 * que `repse_provider_api_error.ts`.
 */
const ERROR_CODE_TO_I18N_BASE: Record<EmployeeBadgeErrorCode, string> = {
  [EMPLOYEE_BADGE_ERROR_CODES.VAL_INPUT]: 'employee_badge_val_input',
  [EMPLOYEE_BADGE_ERROR_CODES.EMPLOYEE_NOT_FOUND]: 'employee_badge_employee_not_found',
  [EMPLOYEE_BADGE_ERROR_CODES.SELF_EMPLOYEE_NOT_FOUND]: 'employee_badge_self_employee_not_found',
  [EMPLOYEE_BADGE_ERROR_CODES.VERIFICATION_NOT_FOUND]: 'employee_badge_verification_not_found',
  [EMPLOYEE_BADGE_ERROR_CODES.SYS_UNHANDLED]: 'employee_badge_unexpected_error',
}

function resolveMessageKey(errorCode: EmployeeBadgeErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: EmployeeBadgeErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_title` : undefined
}

/** Traduce una clave si `i18n` está disponible; si no, devuelve el fallback. */
function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones del módulo "Gafete del empleado" en una respuesta
 * HTTP estable (mensaje, título, status, errorCode y key opcional).
 */
export function resolveEmployeeBadgeApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedEmployeeBadgeApiError {
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
      title: translate(i18n, 'employee_badge_val_input_title', 'Datos inválidos'),
      status: 400,
      errorCode: EMPLOYEE_BADGE_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof EmployeeBadgeError) {
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
    message: translate(i18n, 'employee_badge_unexpected_error_message', fallbackMessage),
    title: translate(i18n, 'employee_badge_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: EMPLOYEE_BADGE_ERROR_CODES.SYS_UNHANDLED,
  }
}

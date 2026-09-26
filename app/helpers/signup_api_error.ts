import type { I18n } from '@adonisjs/i18n'
import { SIGNUP_ERROR_CODES } from '../constants/signup_error_codes.js'
import { SignupServiceError } from '../exceptions/signup_service_error.js'
import type { SignupErrorCode } from '../constants/signup_error_codes.js'

export type ResolvedSignupError = {
  message: string
  title: string
  status: number
  errorCode: SignupErrorCode | string
  key?: string
  detail?: string
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones nuevas del alta self-service (signup) en mensaje HTTP,
 * status y `errorCode` estable. El cliente puede usar `errorCode` con un mapa
 * fijo sin inspeccionar el texto del mensaje.
 *
 * Solo cubre las fallas nuevas de USRH1783712837572 (`SignupServiceError`); el
 * resto de `SignupDraftService` sigue devolviendo su `ServiceResult` legado
 * `{ status, type, title, message, data }` sin pasar por este resolver.
 */
export function resolveSignupApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedSignupError {
  if (error instanceof SignupServiceError) {
    const detail = translate(
      i18n,
      'signup_settings_provisioning_failed',
      error.detail ?? error.message
    )
    return {
      message: detail,
      title: translate(i18n, 'signup_settings_provisioning_failed_title', 'Signup'),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key ?? 'signup-settings-provisioning-failed',
      detail,
    }
  }

  return {
    message: typeof (error as Error)?.message === 'string' ? (error as Error).message : 'Error inesperado',
    title: translate(i18n, 'signup_error_default_title', 'Signup'),
    status: fallbackStatus,
    errorCode: SIGNUP_ERROR_CODES.SYS_UNHANDLED,
  }
}

import type { I18n } from '@adonisjs/i18n'
import { SYSTEM_SETTING_RESOLUTION_ERROR_CODES } from '../constants/system_setting_resolution_error_codes.js'
import { SystemSettingResolutionError } from '../exceptions/system_setting_resolution_error.js'
import type { SystemSettingResolutionErrorCode } from '../constants/system_setting_resolution_error_codes.js'

export type ResolvedSystemSettingError = {
  message: string
  title: string
  status: number
  code: SystemSettingResolutionErrorCode | string
  key?: string
  detail?: string
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte las excepciones de la resolución de System Settings por
 * `business_unit_id` (USRH1783712837584) en mensaje HTTP, status y `code`
 * estable, siguiendo el contrato GSTI `{ title, detail, key, code }`.
 *
 * Solo cubre `SystemSettingResolutionError` (la frontera única de
 * `resolveByBusinessUnitId`); el resto de `SystemSettingService` sigue
 * devolviendo su `ServiceResult` legado `{ status, type, title, message, data }`
 * sin pasar por este resolver.
 */
export function resolveSystemSettingApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedSystemSettingError {
  if (error instanceof SystemSettingResolutionError) {
    const title = translate(i18n, 'system_setting_resolution_not_found_title', 'Configuración no encontrada')
    const detail = translate(
      i18n,
      'system_setting_resolution_not_found_detail',
      error.detail ?? error.message
    )
    return {
      message: detail,
      title,
      status: error.httpStatus,
      code: error.errorCode,
      key: error.key ?? 'configuracion-no-encontrada',
      detail,
    }
  }

  return {
    message: typeof (error as Error)?.message === 'string' ? (error as Error).message : 'Error inesperado',
    title: translate(i18n, 'system_setting_resolution_default_title', 'System Settings'),
    status: fallbackStatus,
    code: SYSTEM_SETTING_RESOLUTION_ERROR_CODES.SYS_UNHANDLED,
  }
}

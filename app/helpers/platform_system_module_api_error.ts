import { PLATFORM_SYSTEM_MODULE_ERROR_CODES } from '../constants/platform_system_module_error_codes.js'
import { PlatformSystemModuleServiceError } from '../exceptions/platform_system_module_service_error.js'

export type ResolvedPlatformSystemModuleError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones de la administración de módulos de plataforma en la
 * respuesta HTTP estable `{ title, detail, key, code }` con prefijo PLT.MOD.*.
 *
 * @param error - Error capturado en el controlador.
 * @param fallbackStatus - Status por defecto para errores no tipados.
 * @returns Cuerpo de error resuelto con su status HTTP.
 */
export function resolvePlatformSystemModuleApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedPlatformSystemModuleError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Módulos de plataforma',
      detail,
      key: 'PLT.MOD.VAL_INPUT',
      code: PLATFORM_SYSTEM_MODULE_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof PlatformSystemModuleServiceError) {
    return {
      title: 'Módulos de plataforma',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en módulos.',
    key: PLATFORM_SYSTEM_MODULE_ERROR_CODES.SYS_UNHANDLED,
    code: PLATFORM_SYSTEM_MODULE_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}

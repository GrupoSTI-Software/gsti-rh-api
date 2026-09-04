import { PLATFORM_DEVICE_ERROR_CODES } from '../constants/platform_device_error_codes.js'
import { PlatformDeviceServiceError } from '../exceptions/platform_device_service_error.js'

export type ResolvedPlatformDeviceError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones del catálogo de dispositivos en la respuesta HTTP
 * estable `{ title, detail, key, code }` con prefijo PLT.DEV.*.
 *
 * @param error - Error capturado en el controlador.
 * @param fallbackStatus - Status por defecto para errores no tipados.
 * @returns Cuerpo de error resuelto con su status HTTP.
 */
export function resolvePlatformDeviceApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedPlatformDeviceError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Inventario de dispositivos',
      detail,
      key: PLATFORM_DEVICE_ERROR_CODES.VAL_INPUT,
      code: PLATFORM_DEVICE_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof PlatformDeviceServiceError) {
    return {
      title: 'Inventario de dispositivos',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en dispositivos.',
    key: PLATFORM_DEVICE_ERROR_CODES.SYS_UNHANDLED,
    code: PLATFORM_DEVICE_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}

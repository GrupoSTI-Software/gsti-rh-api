import type { PlatformDeviceErrorCode } from '../constants/platform_device_error_codes.js'

/**
 * Error de dominio del catálogo de dispositivos de plataforma.
 * Espeja el patrón de `PlatformSystemModuleServiceError`.
 */
export class PlatformDeviceServiceError extends Error {
  readonly errorCode: PlatformDeviceErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: PlatformDeviceErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'PlatformDeviceServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

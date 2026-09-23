import type { PlatformDeviceErrorCode } from '../constants/platform_device_error_codes.js'

/**
 * Error de dominio del catálogo de dispositivos de plataforma, con código HTTP,
 * errorCode estable y key/detail opcionales para la respuesta título/detalle/key.
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

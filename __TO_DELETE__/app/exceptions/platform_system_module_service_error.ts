import type { PlatformSystemModuleErrorCode } from '../constants/platform_system_module_error_codes.js'

/**
 * Error de dominio de la administración de módulos de plataforma con código
 * HTTP y errorCode estable.
 */
export class PlatformSystemModuleServiceError extends Error {
  readonly errorCode: PlatformSystemModuleErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: PlatformSystemModuleErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'PlatformSystemModuleServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

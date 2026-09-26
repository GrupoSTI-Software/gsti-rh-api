import type { PlatformTenantErrorCode } from '../constants/platform_tenant_error_codes.js'

/**
 * Error de dominio del módulo de tenants de plataforma con código HTTP y errorCode estable.
 */
export class PlatformTenantServiceError extends Error {
  readonly errorCode: PlatformTenantErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: PlatformTenantErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'PlatformTenantServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

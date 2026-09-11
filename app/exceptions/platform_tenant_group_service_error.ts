import type { PlatformTenantGroupErrorCode } from '../constants/platform_tenant_group_error_codes.js'

/**
 * Error de dominio del módulo de grupos de tenants con código HTTP y errorCode estable.
 */
export class PlatformTenantGroupServiceError extends Error {
  readonly errorCode: PlatformTenantGroupErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  readonly title?: string

  constructor(
    message: string,
    errorCode: PlatformTenantGroupErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string,
    title?: string
  ) {
    super(message)
    this.name = 'PlatformTenantGroupServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.title = title
  }
}

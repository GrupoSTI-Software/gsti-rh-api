import type { TenantBillingProfileErrorCode } from '#constants/tenant_billing_profile_error_codes'

/**
 * Error de dominio del perfil de facturación del tenant con código HTTP estable.
 */
export class TenantBillingProfileServiceError extends Error {
  readonly errorCode: TenantBillingProfileErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: TenantBillingProfileErrorCode,
    httpStatus: number = 500,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'TenantBillingProfileServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

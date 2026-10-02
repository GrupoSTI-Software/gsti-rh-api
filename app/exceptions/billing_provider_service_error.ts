import type { BillingProviderErrorCode } from '#constants/billing_provider_error_codes'

/**
 * Error de dominio del puerto de proveedor de cobro (USRH1790708507467).
 */
export class BillingProviderServiceError extends Error {
  readonly errorCode: BillingProviderErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: BillingProviderErrorCode,
    httpStatus: number = 500,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'BillingProviderServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

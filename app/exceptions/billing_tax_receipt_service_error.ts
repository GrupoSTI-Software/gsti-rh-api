import type { BillingTaxReceiptErrorCode } from '#constants/billing_tax_receipt_error_codes'
import type { BillingProfileMissingField } from '#helpers/tenant_billing_profile_completeness'

export type BillingTaxReceiptErrorData = {
  missingFields: BillingProfileMissingField[]
}

/**
 * Error de dominio del comprobante fiscal de membresía (USRH1788288461963).
 */
export class BillingTaxReceiptServiceError extends Error {
  readonly errorCode: BillingTaxReceiptErrorCode
  readonly httpStatus: number
  readonly key: string
  readonly detail: string
  readonly data?: BillingTaxReceiptErrorData

  constructor(
    message: string,
    errorCode: BillingTaxReceiptErrorCode,
    httpStatus: number,
    key: string,
    detail: string,
    data?: BillingTaxReceiptErrorData
  ) {
    super(message)
    this.name = 'BillingTaxReceiptServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.data = data
  }
}

import type { BillingPaymentErrorCode } from '../constants/billing_payment_error_codes.js'

/**
 * Error de dominio del módulo de pagos con código HTTP y errorCode estable.
 */
export class BillingPaymentServiceError extends Error {
  readonly errorCode: BillingPaymentErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: BillingPaymentErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'BillingPaymentServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

import type { BillingSubscriptionErrorCode } from '../constants/billing_subscription_error_codes.js'

/**
 * Error de dominio del módulo de suscripciones con código HTTP y errorCode estable.
 */
export class BillingSubscriptionServiceError extends Error {
  readonly errorCode: BillingSubscriptionErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: BillingSubscriptionErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'BillingSubscriptionServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

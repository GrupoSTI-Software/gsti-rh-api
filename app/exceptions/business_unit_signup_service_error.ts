import type { BusinessUnitSignupErrorCode } from '../constants/business_unit_signup_error_codes.js'

/**
 * Error de dominio del alta de empresa adicional (USRH1787932877001).
 * Código HTTP y `errorCode` estables para el cliente.
 * Patrón idéntico a `BillingSubscriptionServiceError`.
 */
export class BusinessUnitSignupServiceError extends Error {
  readonly errorCode: BusinessUnitSignupErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: BusinessUnitSignupErrorCode,
    httpStatus: number = 500,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'BusinessUnitSignupServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

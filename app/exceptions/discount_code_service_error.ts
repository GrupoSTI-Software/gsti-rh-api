import type { DiscountCodeErrorCode } from '../constants/discount_code_error_codes.js'

/**
 * Error de dominio del catálogo de códigos de descuento con código HTTP y
 * errorCode estable.
 */
export class DiscountCodeServiceError extends Error {
  readonly errorCode: DiscountCodeErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: DiscountCodeErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'DiscountCodeServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

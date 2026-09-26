import type { BillingCatalogErrorCode } from '../constants/billing_catalog_error_codes.js'

/**
 * Error de dominio del módulo de catálogo de cobro con código HTTP y errorCode estable.
 */
export class BillingCatalogServiceError extends Error {
  readonly errorCode: BillingCatalogErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: BillingCatalogErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'BillingCatalogServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

import type { SatCatalogErrorCode } from '#constants/sat_catalog_error_codes'

/**
 * Error de dominio de los catálogos fiscales del SAT con código HTTP estable.
 */
export class SatCatalogServiceError extends Error {
  readonly errorCode: SatCatalogErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: SatCatalogErrorCode,
    httpStatus: number = 500,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'SatCatalogServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

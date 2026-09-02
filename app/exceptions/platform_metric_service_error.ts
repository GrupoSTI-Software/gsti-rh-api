import type { PlatformMetricErrorCode } from '../constants/platform_metric_error_codes.js'

/**
 * Error de dominio del área de métricas de plataforma, con código HTTP y
 * `errorCode` estable. Superficie compartida: la usan todas las métricas.
 */
export class PlatformMetricServiceError extends Error {
  readonly errorCode: PlatformMetricErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: PlatformMetricErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'PlatformMetricServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

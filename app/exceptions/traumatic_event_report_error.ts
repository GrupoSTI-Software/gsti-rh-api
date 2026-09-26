import type { EtrErrorCode } from '../constants/traumatic_event_report_error_codes.js'

/**
 * Excepción de dominio del módulo de reportes de evento traumático.
 * Lleva consigo el código estable y el HTTP status sugerido.
 */
export class TraumaticEventReportError extends Error {
  readonly errorCode: EtrErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(
    message: string,
    errorCode: EtrErrorCode,
    httpStatus: number = 400,
    key?: string
  ) {
    super(message)
    this.name = 'TraumaticEventReportError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

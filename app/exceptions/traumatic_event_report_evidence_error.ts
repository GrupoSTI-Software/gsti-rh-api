import type { TereErrorCode } from '../constants/traumatic_event_report_evidence_error_codes.js'

/**
 * Excepción de dominio del módulo de evidencias de reporte de evento
 * traumático. Lleva consigo el `code` estable, el HTTP status sugerido
 * y el `key` kebab-case para i18n del cliente.
 */
export class TraumaticEventReportEvidenceError extends Error {
  readonly code: TereErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(message: string, code: TereErrorCode, httpStatus: number = 400, key?: string) {
    super(message)
    this.name = 'TraumaticEventReportEvidenceError'
    this.code = code
    this.httpStatus = httpStatus
    this.key = key
  }
}

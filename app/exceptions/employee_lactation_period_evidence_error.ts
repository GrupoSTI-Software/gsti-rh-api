import type { ElpeErrorCode } from '../constants/employee_lactation_period_evidence_error_codes.js'

/**
 * Excepción de dominio del módulo de evidencias de periodo de lactancia.
 * Lleva consigo el código estable y el HTTP status sugerido.
 */
export class EmployeeLactationPeriodEvidenceError extends Error {
  readonly errorCode: ElpeErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(
    message: string,
    errorCode: ElpeErrorCode,
    httpStatus: number = 400,
    key?: string
  ) {
    super(message)
    this.name = 'EmployeeLactationPeriodEvidenceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

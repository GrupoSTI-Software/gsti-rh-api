import type { ElpErrorCode } from '../constants/employee_lactation_period_error_codes.js'

/**
 * Excepción de dominio del módulo de periodos de lactancia.
 * Lleva consigo el código estable y el HTTP status sugerido.
 */
export class EmployeeLactationPeriodError extends Error {
  readonly errorCode: ElpErrorCode
  readonly httpStatus: number
  readonly key?: string

  constructor(
    message: string,
    errorCode: ElpErrorCode,
    httpStatus: number = 400,
    key?: string
  ) {
    super(message)
    this.name = 'EmployeeLactationPeriodError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
  }
}

import type { EmployeeReactivationErrorCode } from '../constants/employee_reactivation_error_codes.js'

/**
 * Error de dominio de la reactivación de colaboradores (VLRH-H1790812613829).
 * Espejo de `EmployeeQuotaError` más `data`: cada error define la carga que
 * viaja al cliente (código ocupado manda `{ employeeCode }`); el resolvedor no
 * fija su forma.
 */
export class EmployeeReactivationError extends Error {
  readonly errorCode: EmployeeReactivationErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  readonly i18nData?: Record<string, string | number>
  readonly data?: Record<string, string | number>

  constructor(
    message: string,
    errorCode: EmployeeReactivationErrorCode,
    httpStatus: number = 409,
    key?: string,
    detail?: string,
    i18nData?: Record<string, string | number>,
    data?: Record<string, string | number>
  ) {
    super(message)
    this.name = 'EmployeeReactivationError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.i18nData = i18nData
    this.data = data
  }
}

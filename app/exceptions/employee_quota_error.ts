import type { EmployeeQuotaErrorCode } from '../constants/employee_quota_error_codes.js'

/**
 * Error de dominio del cupo de empleados por empresa.
 */
export class EmployeeQuotaError extends Error {
  readonly errorCode: EmployeeQuotaErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  readonly i18nData?: Record<string, string | number>

  constructor(
    message: string,
    errorCode: EmployeeQuotaErrorCode,
    httpStatus: number = 409,
    key?: string,
    detail?: string,
    i18nData?: Record<string, string | number>
  ) {
    super(message)
    this.name = 'EmployeeQuotaError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.i18nData = i18nData
  }
}

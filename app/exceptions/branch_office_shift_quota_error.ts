import type { BranchOfficeShiftQuotaErrorCode } from '../constants/branch_office_shift_quota_error_codes.js'

/**
 * Error de dominio del módulo de cuotas de plantilla por sucursal y turno.
 */
export class BranchOfficeShiftQuotaError extends Error {
  readonly errorCode: BranchOfficeShiftQuotaErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string
  readonly i18nData?: Record<string, string | number>

  constructor(
    message: string,
    errorCode: BranchOfficeShiftQuotaErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string,
    i18nData?: Record<string, string | number>
  ) {
    super(message)
    this.name = 'BranchOfficeShiftQuotaError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
    this.i18nData = i18nData
  }
}

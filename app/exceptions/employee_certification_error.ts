import type { EcErrorCode } from '../constants/employee_certification_error_codes.js'

export class EmployeeCertificationError extends Error {
  readonly errorCode: EcErrorCode
  readonly httpStatus: number

  constructor(message: string, errorCode: EcErrorCode, httpStatus: number = 400) {
    super(message)
    this.name = 'EmployeeCertificationError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
  }
}

import type { PcrErrorCode } from '../constants/position_certification_requirement_error_codes.js'

export class PositionCertificationRequirementError extends Error {
  readonly errorCode: PcrErrorCode
  readonly httpStatus: number

  constructor(message: string, errorCode: PcrErrorCode, httpStatus: number = 400) {
    super(message)
    this.name = 'PositionCertificationRequirementError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
  }
}

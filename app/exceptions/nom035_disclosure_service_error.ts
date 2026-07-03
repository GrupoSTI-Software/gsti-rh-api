import type { Nom035DisclosureErrorCode } from '../constants/nom035_disclosure_error_codes.js'

export class Nom035DisclosureServiceError extends Error {
  readonly errorCode: Nom035DisclosureErrorCode
  readonly httpStatus: number

  constructor(message: string, errorCode: Nom035DisclosureErrorCode, httpStatus: number = 400) {
    super(message)
    this.name = 'Nom035DisclosureServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
  }
}

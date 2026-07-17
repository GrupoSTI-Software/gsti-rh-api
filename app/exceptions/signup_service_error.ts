import type { SignupErrorCode } from '../constants/signup_error_codes.js'

/**
 * Error de dominio del alta self-service (signup) con código HTTP y `errorCode`
 * estable para el cliente. Se usa dentro de `SignupDraftService.complete()` para
 * las fallas nuevas introducidas por USRH1783712837572 (provisión de
 * `system_settings` del tenant), que se alinean al estándar GSTI
 * `{ title, detail, key, errorCode }` en vez del `{ status, type, title, message, data }`
 * legado del resto del área signup (decisión consciente, ver spec §5).
 */
export class SignupServiceError extends Error {
  readonly errorCode: SignupErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: SignupErrorCode,
    httpStatus: number = 500,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'SignupServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}

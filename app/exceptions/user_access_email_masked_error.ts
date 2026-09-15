import type { UserAccessEmailErrorCode } from '#constants/user_access_email_error_codes'

/**
 * Excepción de dominio: correo de acceso con carácter de máscara.
 * Prohibido incluir el valor intentado en `message`.
 */
export class UserAccessEmailMaskedError extends Error {
  readonly errorCode: UserAccessEmailErrorCode
  readonly httpStatus: number = 422

  constructor(errorCode: UserAccessEmailErrorCode) {
    super('User access email contains mask character')
    this.name = 'UserAccessEmailMaskedError'
    this.errorCode = errorCode
  }
}

/**
 * Códigos estables para rechazo de correo de acceso (USRH1789328027034, USRH1789698261611).
 * Prefijo USR = Users.
 */
export const USER_ACCESS_EMAIL_ERROR_CODES = {
  /** El correo de acceso contiene el carácter de máscara U+2022. */
  MASKED: 'USR.MAIL.001',
  /** El correo de acceso ya lo usa otra cuenta viva. */
  DUPLICATED: 'USR.MAIL.002',
} as const

export type UserAccessEmailErrorCode =
  (typeof USER_ACCESS_EMAIL_ERROR_CODES)[keyof typeof USER_ACCESS_EMAIL_ERROR_CODES]

export type UserAccessEmailErrorDefinition = {
  key: string
  code: UserAccessEmailErrorCode
  status: number
}

export const USER_ACCESS_EMAIL_ERRORS: Record<'MASKED' | 'DUPLICATED', UserAccessEmailErrorDefinition> = {
  MASKED: { key: 'no-fue-posible-guardar-el-correo-de-acceso', code: USER_ACCESS_EMAIL_ERROR_CODES.MASKED, status: 422 },
  DUPLICATED: { key: 'correo-de-acceso-ya-registrado', code: USER_ACCESS_EMAIL_ERROR_CODES.DUPLICATED, status: 400 },
}

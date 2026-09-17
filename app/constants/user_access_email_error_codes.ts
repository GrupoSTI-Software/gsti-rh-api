/**
 * Códigos estables para rechazo de correo de acceso enmascarado (USRH1789328027034).
 * Prefijo USR = Users.
 */
export const USER_ACCESS_EMAIL_ERROR_CODES = {
  /** El correo de acceso contiene el carácter de máscara U+2022. */
  MASKED: 'USR.MAIL.001',
} as const

export type UserAccessEmailErrorCode =
  (typeof USER_ACCESS_EMAIL_ERROR_CODES)[keyof typeof USER_ACCESS_EMAIL_ERROR_CODES]

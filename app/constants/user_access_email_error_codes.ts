/**
 * Códigos estables para rechazo de correo de acceso (USRH1789328027034, USRH1789698261611,
 * USRH1789698261612). Prefijo USR = Users.
 */
export const USER_ACCESS_EMAIL_ERROR_CODES = {
  /** El correo de acceso contiene el carácter de máscara U+2022. */
  MASKED: 'USR.MAIL.001',
  /** El correo de acceso ya lo usa otra cuenta viva. */
  DUPLICATED: 'USR.MAIL.002',
  /** El correo personal que el espejo iba a escribir ya lo usa otra persona viva. */
  MIRROR_PERSON_EMAIL_DUPLICATED: 'USR.MAIL.003',
  /** El correo institucional que el espejo iba a escribir ya lo usa otro empleado vivo. */
  MIRROR_EMPLOYEE_EMAIL_DUPLICATED: 'USR.MAIL.004',
  /** La cuenta de acceso que el espejo iba a tocar no está al alcance del actor. */
  MIRROR_TARGET_OUT_OF_SCOPE: 'USR.MAIL.005',
  /** La persona tiene más de una cuenta viva: no se decide a cuál escribir. */
  MIRROR_AMBIGUOUS_ACCOUNT: 'USR.MAIL.006',
} as const

export type UserAccessEmailErrorCode =
  (typeof USER_ACCESS_EMAIL_ERROR_CODES)[keyof typeof USER_ACCESS_EMAIL_ERROR_CODES]

export type UserAccessEmailErrorDefinition = {
  key: string
  code: UserAccessEmailErrorCode
  status: number
}

export const USER_ACCESS_EMAIL_ERRORS: Record<
  keyof typeof USER_ACCESS_EMAIL_ERROR_CODES,
  UserAccessEmailErrorDefinition
> = {
  MASKED: { key: 'no-fue-posible-guardar-el-correo-de-acceso', code: USER_ACCESS_EMAIL_ERROR_CODES.MASKED, status: 422 },
  DUPLICATED: { key: 'correo-de-acceso-ya-registrado', code: USER_ACCESS_EMAIL_ERROR_CODES.DUPLICATED, status: 400 },
  MIRROR_PERSON_EMAIL_DUPLICATED: {
    key: 'correo-personal-ya-registrado',
    code: USER_ACCESS_EMAIL_ERROR_CODES.MIRROR_PERSON_EMAIL_DUPLICATED,
    status: 400,
  },
  MIRROR_EMPLOYEE_EMAIL_DUPLICATED: {
    key: 'correo-institucional-ya-registrado',
    code: USER_ACCESS_EMAIL_ERROR_CODES.MIRROR_EMPLOYEE_EMAIL_DUPLICATED,
    status: 400,
  },
  MIRROR_TARGET_OUT_OF_SCOPE: {
    key: 'cuenta-de-acceso-fuera-de-alcance',
    code: USER_ACCESS_EMAIL_ERROR_CODES.MIRROR_TARGET_OUT_OF_SCOPE,
    status: 403,
  },
  MIRROR_AMBIGUOUS_ACCOUNT: {
    key: 'cuenta-de-acceso-no-determinada',
    code: USER_ACCESS_EMAIL_ERROR_CODES.MIRROR_AMBIGUOUS_ACCOUNT,
    status: 400,
  },
}

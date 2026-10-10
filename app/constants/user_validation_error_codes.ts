/**
 * Códigos estables para validación de campos requeridos de usuarios (USRH1789698261611, seguimiento).
 * Prefijo USR = Users.
 */
export const USER_VALIDATION_ERROR_CODES = {
  /** La petición no trae el expediente (persona) al que pertenece la cuenta. */
  PERSON_REQUIRED: 'USR.VAL.001',
  /** `accessStatus` o `sort` del listado fuera de su catálogo (VLRH-H1791581963402). */
  LIST_FILTERS_INVALID: 'USR.VAL.002',
} as const

export type UserValidationErrorCode =
  (typeof USER_VALIDATION_ERROR_CODES)[keyof typeof USER_VALIDATION_ERROR_CODES]

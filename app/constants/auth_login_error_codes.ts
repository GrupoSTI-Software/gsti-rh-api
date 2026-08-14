/**
 * Códigos de error del inicio de sesión (USRH1786736057519 E3).
 * Contrato v2: `{ title, detail, key }`.
 */
export const AUTH_LOGIN_ERROR_CODES = {
  BACKOFFICE_FORBIDDEN: 'AUTH.LOGIN.BACKOFFICE_FORBIDDEN',
  RATE_LIMITED: 'AUTH.LOGIN.RATE_LIMITED',
} as const

export type AuthLoginErrorCode =
  (typeof AUTH_LOGIN_ERROR_CODES)[keyof typeof AUTH_LOGIN_ERROR_CODES]

export interface AuthLoginErrorDefinition {
  key: AuthLoginErrorCode
  title: string
  detail: string
}

export const AUTH_LOGIN_ERRORS: Record<
  'BACKOFFICE_FORBIDDEN',
  AuthLoginErrorDefinition
> = {
  BACKOFFICE_FORBIDDEN: {
    key: AUTH_LOGIN_ERROR_CODES.BACKOFFICE_FORBIDDEN,
    title: 'Acceso no disponible',
    detail: 'Tu acceso a Valanserh es desde la aplicación del empleado.',
  },
}

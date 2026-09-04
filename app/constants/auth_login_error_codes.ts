/**
 * Códigos de error del inicio de sesión (USRH1786736057519 E3).
 * Contrato v2: `{ title, detail, key }`.
 */
export const AUTH_LOGIN_ERROR_CODES = {
  BACKOFFICE_FORBIDDEN: 'AUTH.LOGIN.BACKOFFICE_FORBIDDEN',
  RATE_LIMITED: 'AUTH.LOGIN.RATE_LIMITED',
  /** Las credenciales son validas pero la persona no tiene colaborador ligado. */
  EMPLOYEE_NOT_FOUND: 'AUTH.LOGIN.EMPLOYEE_NOT_FOUND',
  /** El equipo ya esta registrado a nombre de otro colaborador. */
  DEVICE_TAKEN: 'AUTH.LOGIN.DEVICE_TAKEN',
} as const

export type AuthLoginErrorCode =
  (typeof AUTH_LOGIN_ERROR_CODES)[keyof typeof AUTH_LOGIN_ERROR_CODES]

export interface AuthLoginErrorDefinition {
  key: AuthLoginErrorCode
  title: string
  detail: string
}

export const AUTH_LOGIN_ERRORS: Record<
  'BACKOFFICE_FORBIDDEN' | 'RATE_LIMITED' | 'EMPLOYEE_NOT_FOUND' | 'DEVICE_TAKEN',
  AuthLoginErrorDefinition
> = {
  BACKOFFICE_FORBIDDEN: {
    key: AUTH_LOGIN_ERROR_CODES.BACKOFFICE_FORBIDDEN,
    title: 'Acceso no disponible',
    detail: 'Tu acceso a Valanserh es desde la aplicación del empleado.',
  },
  RATE_LIMITED: {
    key: AUTH_LOGIN_ERROR_CODES.RATE_LIMITED,
    title: 'Demasiados intentos',
    detail:
      'Se alcanzó el límite de intentos de acceso. Espera unos minutos antes de volver a intentarlo.',
  },
  EMPLOYEE_NOT_FOUND: {
    key: AUTH_LOGIN_ERROR_CODES.EMPLOYEE_NOT_FOUND,
    title: 'Cuenta sin colaborador',
    detail:
      'Tu cuenta todavía no está lista para usar la aplicación. Acude a tu área de personal.',
  },
  DEVICE_TAKEN: {
    key: AUTH_LOGIN_ERROR_CODES.DEVICE_TAKEN,
    title: 'Equipo ya registrado',
    detail:
      'Este equipo ya está registrado a nombre de otra persona. Acude a tu área de personal.',
  },
}

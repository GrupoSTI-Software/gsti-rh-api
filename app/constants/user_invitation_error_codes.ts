/**
 * Códigos estables para invitación y reenvío de acceso (USRH1786736057522).
 * Prefijo USR = Users.
 */
export const USER_INVITATION_ERROR_CODES = {
  /** Usuario ya fijó su propia contraseña; no aplica reenvío. */
  ALREADY_ACTIVATED: 'USR.RSND.001',
  /** Usuario inexistente o fuera del scope de la empresa del administrador. */
  NOT_FOUND: 'USR.RSND.002',
  /** Cupo de reenvíos agotado (por usuario o por empresa). */
  RATE_LIMITED: 'USR.RSND.003',
  /** Cuenta pendiente de activar; no puede iniciar sesión. */
  PENDING_ACTIVATION: 'USR.PEND.001',
} as const

export type UserInvitationErrorCode =
  (typeof USER_INVITATION_ERROR_CODES)[keyof typeof USER_INVITATION_ERROR_CODES]

export interface UserInvitationResendErrorDefinition {
  key: string
  title: string
  detail: string
  code: UserInvitationErrorCode
  status: number
}

export const USER_INVITATION_RESEND_ERRORS = {
  ALREADY_ACTIVATED: {
    key: 'usuario-ya-activado',
    title: 'Usuario ya activado',
    detail: 'Esta cuenta ya tiene contraseña propia. La recuperación de acceso es por el flujo de contraseña olvidada.',
    code: USER_INVITATION_ERROR_CODES.ALREADY_ACTIVATED,
    status: 409,
  },
  NOT_FOUND: {
    key: 'usuario-no-encontrado',
    title: 'Usuario no encontrado',
    detail: 'No existe un usuario accesible con el identificador indicado.',
    code: USER_INVITATION_ERROR_CODES.NOT_FOUND,
    status: 404,
  },
  RATE_LIMITED: {
    key: 'demasiados-reenvios',
    title: 'Demasiados reenvíos',
    detail: 'Se alcanzó el límite de reenvíos de acceso. Intenta de nuevo más tarde.',
    code: USER_INVITATION_ERROR_CODES.RATE_LIMITED,
    status: 429,
  },
} as const satisfies Record<string, UserInvitationResendErrorDefinition>

export const USER_INVITATION_LOGIN_ERRORS = {
  PENDING_ACTIVATION: {
    key: 'cuenta-pendiente-de-activar',
    title: 'Cuenta pendiente de activar',
    detail:
      'Tu cuenta aún no está activa. Revisa tu correo y sigue el enlace de invitación para elegir tu contraseña.',
    code: USER_INVITATION_ERROR_CODES.PENDING_ACTIVATION,
    status: 403,
  },
} as const

/**
 * Códigos estables para aceptar invitación y fijar contraseña (USRH1786736057525).
 * Prefijo INV = Invitation accept.
 */
export const AUTH_INVITATION_ERROR_CODES = {
  /** Enlace inexistente, vencido o ya consumido (respuesta indistinguible). */
  INVALID_LINK: 'INV.NF.001',
  /** Contraseña que no cumple la política de seguridad. */
  PASSWORD_POLICY: 'INV.VAL.001',
  /** Confirmación distinta a la contraseña. */
  PASSWORD_MISMATCH: 'INV.VAL.002',
  /** Cupo de intentos agotado por token o por IP. */
  RATE_LIMITED: 'INV.RATE.001',
} as const

export type AuthInvitationErrorCode =
  (typeof AUTH_INVITATION_ERROR_CODES)[keyof typeof AUTH_INVITATION_ERROR_CODES]

export interface AuthInvitationErrorDefinition {
  key: string
  title: string
  detail: string
  code: AuthInvitationErrorCode
  status: number
}

export const AUTH_INVITATION_ERRORS = {
  INVALID_LINK: {
    key: 'enlace-no-valido',
    title: 'Enlace no válido',
    detail:
      'El enlace de invitación no es válido o ya no está disponible. Solicita uno nuevo a tu administrador.',
    code: AUTH_INVITATION_ERROR_CODES.INVALID_LINK,
    status: 404,
  },
  PASSWORD_POLICY: {
    key: 'contrasena-no-valida',
    title: 'Contraseña no válida',
    detail:
      'La contraseña debe tener al menos 12 caracteres e incluir una mayúscula, un número y un símbolo.',
    code: AUTH_INVITATION_ERROR_CODES.PASSWORD_POLICY,
    status: 422,
  },
  PASSWORD_MISMATCH: {
    key: 'la-confirmacion-no-coincide',
    title: 'Contraseña no válida',
    detail: 'La confirmación no coincide con la contraseña.',
    code: AUTH_INVITATION_ERROR_CODES.PASSWORD_MISMATCH,
    status: 422,
  },
  RATE_LIMITED: {
    key: 'demasiados-intentos-invitacion',
    title: 'Demasiados intentos',
    detail: 'Se alcanzó el límite de intentos para este enlace. Intenta de nuevo más tarde.',
    code: AUTH_INVITATION_ERROR_CODES.RATE_LIMITED,
    status: 429,
  },
} as const satisfies Record<string, AuthInvitationErrorDefinition>

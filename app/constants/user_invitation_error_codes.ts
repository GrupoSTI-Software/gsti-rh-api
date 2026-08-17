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

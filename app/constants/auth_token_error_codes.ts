/**
 * Códigos de error de autenticación por token.
 * Permiten al cliente distinguir cuándo intentar refresh vs logout directo.
 */
export type AccessTokenErrorCode = 'token_missing' | 'token_invalid' | 'token_expired' | 'token_revoked'

export type RefreshTokenErrorCode =
  | 'refresh_token_missing'
  | 'refresh_token_invalid'
  | 'refresh_token_expired'
  | 'refresh_token_revoked'

export interface AuthTokenErrorDefinition {
  key: string
  title: string
  detail: string
  wwwAuthenticate: string
  /** Indica si el cliente debería intentar refresh antes de cerrar sesión. */
  refreshable: boolean
}

export const ACCESS_TOKEN_ERRORS: Record<AccessTokenErrorCode, AuthTokenErrorDefinition> = {
  token_missing: {
    key: 'AUTH.TOKEN.MISSING',
    title: 'Token requerido',
    detail: 'No se envió un access token válido',
    wwwAuthenticate: 'Bearer error="invalid_token"',
    refreshable: false,
  },
  token_expired: {
    key: 'AUTH.TOKEN.EXPIRED',
    title: 'Sesión expirada',
    detail: 'El access token ha expirado',
    wwwAuthenticate: 'Bearer error="token_expired"',
    refreshable: true,
  },
  token_revoked: {
    key: 'AUTH.TOKEN.REVOKED',
    title: 'Sesión revocada',
    detail: 'La sesión fue cerrada o reemplazada en el servidor',
    wwwAuthenticate: 'Bearer error="token_revoked"',
    refreshable: false,
  },
  token_invalid: {
    key: 'AUTH.TOKEN.INVALID',
    title: 'Token inválido',
    detail: 'El access token es inválido o está corrupto',
    wwwAuthenticate: 'Bearer error="invalid_token"',
    refreshable: false,
  },
}

export const REFRESH_TOKEN_ERRORS: Record<RefreshTokenErrorCode, AuthTokenErrorDefinition> = {
  refresh_token_missing: {
    key: 'AUTH.REFRESH.MISSING',
    title: 'Refresh token requerido',
    detail: 'No se envió un refresh token válido',
    wwwAuthenticate: 'Bearer error="invalid_token"',
    refreshable: false,
  },
  refresh_token_expired: {
    key: 'AUTH.REFRESH.EXPIRED',
    title: 'Sesión expirada',
    detail: 'El refresh token ha expirado; inicia sesión nuevamente',
    wwwAuthenticate: 'Bearer error="token_expired"',
    refreshable: false,
  },
  refresh_token_revoked: {
    key: 'AUTH.REFRESH.REVOKED',
    title: 'Sesión revocada',
    detail: 'El refresh token fue revocado; inicia sesión nuevamente',
    wwwAuthenticate: 'Bearer error="token_revoked"',
    refreshable: false,
  },
  refresh_token_invalid: {
    key: 'AUTH.REFRESH.INVALID',
    title: 'Refresh token inválido',
    detail: 'El refresh token es inválido o está corrupto',
    wwwAuthenticate: 'Bearer error="invalid_token"',
    refreshable: false,
  },
}

import type { Response } from '@adonisjs/core/http'
import {
  ACCESS_TOKEN_ERRORS,
  REFRESH_TOKEN_ERRORS,
  type AccessTokenErrorCode,
  type AuthTokenErrorDefinition,
  type RefreshTokenErrorCode,
} from '#constants/auth_token_error_codes'

function buildUnauthorizedBody(error: AuthTokenErrorDefinition) {
  return {
    type: 'warning' as const,
    title: error.title,
    detail: error.detail,
    message: error.detail,
    key: error.key,
    data: {
      refreshable: error.refreshable,
    },
  }
}

/**
 * Responde 401 para fallos de access token con header WWW-Authenticate y contrato GSTI.
 * Usa response.json() explícito para garantizar cuerpo en la respuesta HTTP.
 */
export function respondAccessTokenUnauthorized(
  response: Response,
  code: AccessTokenErrorCode
) {
  const error = ACCESS_TOKEN_ERRORS[code]
  response.header('WWW-Authenticate', error.wwwAuthenticate)
  return response.status(401).json(buildUnauthorizedBody(error))
}

/**
 * Responde 401 para fallos de refresh token con header WWW-Authenticate y contrato GSTI.
 * Usa response.json() explícito para garantizar cuerpo en la respuesta HTTP.
 */
export function respondRefreshTokenUnauthorized(
  response: Response,
  code: RefreshTokenErrorCode
) {
  const error = REFRESH_TOKEN_ERRORS[code]
  response.header('WWW-Authenticate', error.wwwAuthenticate)
  return response.status(401).json(buildUnauthorizedBody(error))
}

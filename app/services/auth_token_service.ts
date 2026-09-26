import { Secret } from '@adonisjs/core/helpers'
import { AccessToken } from '@adonisjs/auth/access_tokens'
import { DateTime } from 'luxon'
import User from '#models/user'
import ApiToken from '#models/api_token'
import type {
  AccessTokenErrorCode,
  RefreshTokenErrorCode,
} from '#constants/auth_token_error_codes'

const ACCESS_TOKEN_PREFIX = 'oauth__sae__'
const REFRESH_TOKEN_PREFIX = 'refresh__sae__'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export type AccessTokenVerifyResult =
  | { status: 'valid'; user: User }
  | { status: 'error'; code: AccessTokenErrorCode }

export type RefreshTokenVerifyResult =
  | { status: 'valid'; user: User; origin: string }
  | { status: 'error'; code: RefreshTokenErrorCode }

/**
 * Servicio centralizado para emisión, rotación y clasificación de tokens.
 * Reutiliza la tabla `api_tokens` distinguiendo tipos por la columna `type`.
 */
export default class AuthTokenService {
  /**
   * Revoca todos los tokens (access + refresh) de un usuario para un origin.
   * El delete no filtra por `type`, por lo que cubre ambos tipos en una sola operación.
   */
  async revokeByOrigin(userId: number, origin: string): Promise<void> {
    await ApiToken.query().where('tokenable_id', userId).where('origin', origin).delete()
  }

  /**
   * Emite un par access + refresh y asigna el origin a ambos registros.
   */
  async issueTokenPair(user: User, origin: string): Promise<TokenPair> {
    const accessToken = await User.accessTokens.create(user, undefined, {
      expiresIn: User.accessTokenExpiresIn(),
    })
    await ApiToken.query().where('id', String(accessToken.identifier)).update({ origin })

    const refreshToken = await User.refreshTokens.create(user, undefined, {
      expiresIn: User.refreshTokenExpiresIn(origin),
    })
    await ApiToken.query().where('id', String(refreshToken.identifier)).update({ origin })

    return {
      accessToken: accessToken.value!.release(),
      refreshToken: refreshToken.value!.release(),
    }
  }

  /**
   * Rota la sesión completa: revoca tokens del origin y emite par nuevo.
   */
  async rotateTokenPair(user: User, origin: string): Promise<TokenPair> {
    await this.revokeByOrigin(user.userId, origin)
    return this.issueTokenPair(user, origin)
  }

  /**
   * Clasifica el motivo de fallo de un access token para responder 401 de forma no ambigua.
   */
  async classifyAccessToken(authorizationHeader?: string | null): Promise<AccessTokenVerifyResult> {
    const tokenValue = this.extractBearerToken(authorizationHeader)

    if (!tokenValue) {
      return { status: 'error', code: 'token_missing' }
    }

    const decoded = AccessToken.decode(ACCESS_TOKEN_PREFIX, tokenValue)
    if (!decoded) {
      return { status: 'error', code: 'token_invalid' }
    }

    const verifiedToken = await User.accessTokens.verify(new Secret(tokenValue))

    if (verifiedToken) {
      if (verifiedToken.isExpired()) {
        return { status: 'error', code: 'token_expired' }
      }

      const user = await this.findActiveUser(Number(verifiedToken.tokenableId))
      if (!user) {
        return { status: 'error', code: 'token_revoked' }
      }

      return { status: 'valid', user }
    }

    return this.classifyMissingAccessToken(decoded.identifier)
  }

  /**
   * Verifica un refresh token y clasifica el motivo de fallo.
   */
  async verifyRefreshToken(refreshTokenValue: string): Promise<RefreshTokenVerifyResult> {
    if (!refreshTokenValue || typeof refreshTokenValue !== 'string') {
      return { status: 'error', code: 'refresh_token_missing' }
    }

    const decoded = AccessToken.decode(REFRESH_TOKEN_PREFIX, refreshTokenValue)
    if (!decoded) {
      return { status: 'error', code: 'refresh_token_invalid' }
    }

    const verifiedToken = await User.refreshTokens.verify(new Secret(refreshTokenValue))

    if (verifiedToken) {
      if (verifiedToken.isExpired()) {
        return { status: 'error', code: 'refresh_token_expired' }
      }

      const apiTokenRow = await ApiToken.query()
        .where('id', String(verifiedToken.identifier))
        .first()

      const origin = apiTokenRow?.origin || 'web'
      const user = await this.findActiveUser(Number(verifiedToken.tokenableId))

      if (!user) {
        return { status: 'error', code: 'refresh_token_revoked' }
      }

      return { status: 'valid', user, origin }
    }

    const row = await ApiToken.query()
      .where('id', String(decoded.identifier))
      .where('type', 'refresh_token')
      .first()

    if (!row) {
      return { status: 'error', code: 'refresh_token_revoked' }
    }

    if (this.isExpiredAt(row.expiresAt)) {
      return { status: 'error', code: 'refresh_token_expired' }
    }

    return { status: 'error', code: 'refresh_token_invalid' }
  }

  private extractBearerToken(authorizationHeader?: string | null): string | null {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return null
    }

    const tokenValue = authorizationHeader.slice(7).trim()
    return tokenValue || null
  }

  private async findActiveUser(userId: number): Promise<User | null> {
    return User.query()
      .where('user_id', userId)
      .where('user_active', 1)
      .whereNull('user_deleted_at')
      .first()
  }

  private isExpiredAt(expiresAt: DateTime | null): boolean {
    if (!expiresAt) {
      return false
    }

    return expiresAt < DateTime.now()
  }

  /**
   * Cuando verify() devuelve null, distingue expirado, revocado o inválido
   * consultando la fila persistida por id + type.
   */
  private async classifyMissingAccessToken(
    identifier: string | number | BigInt
  ): Promise<{ status: 'error'; code: AccessTokenErrorCode }> {
    const row = await ApiToken.query()
      .where('id', String(identifier))
      .where('type', 'auth_token')
      .first()

    if (!row) {
      return { status: 'error', code: 'token_revoked' }
    }

    if (this.isExpiredAt(row.expiresAt)) {
      return { status: 'error', code: 'token_expired' }
    }

    return { status: 'error', code: 'token_invalid' }
  }
}

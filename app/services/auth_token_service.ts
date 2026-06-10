import { Secret } from '@adonisjs/core/helpers'
import User from '#models/user'
import ApiToken from '#models/api_token'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/**
 * Servicio centralizado para emisión y rotación de pares access + refresh token.
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
    const accessToken = await User.accessTokens.create(user)
    await ApiToken.query().where('id', String(accessToken.identifier)).update({ origin })

    const refreshToken = await User.refreshTokens.create(user)
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
   * Verifica un refresh token opaco y devuelve el registro validado junto con su origin.
   */
  async verifyRefreshToken(
    refreshTokenValue: string
  ): Promise<{ user: User; origin: string } | null> {
    const verifiedToken = await User.refreshTokens.verify(new Secret(refreshTokenValue))

    if (!verifiedToken || verifiedToken.isExpired()) {
      return null
    }

    const apiTokenRow = await ApiToken.query()
      .where('id', String(verifiedToken.identifier))
      .first()

    const origin = apiTokenRow?.origin || 'web'

    const userId = Number(verifiedToken.tokenableId)

    const user = await User.query()
      .where('user_id', userId)
      .where('user_active', 1)
      .whereNull('user_deleted_at')
      .first()

    if (!user) {
      return null
    }

    return { user, origin }
  }
}

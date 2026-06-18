import { Secret } from '@adonisjs/core/helpers'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import User from '#models/user'
import ApiToken from '#models/api_token'
import AuthMailService, { type AuthMailLanguage } from '#services/auth_mail_service'
import AuthTokenService from '#services/auth_token_service'
import Ws from '#services/ws'

const DEFAULT_BACKOFFICE_URL = 'http://127.0.0.1:3000'
const MAGIC_LINK_ORIGIN = 'web'
export interface MagicLinkVerifyResult {
  user: User
  accessToken: string
  refreshToken: string
}

/**
 * Servicio del flujo de magic link: solicitud, envío de correo y consumo single-use.
 */
export default class MagicLinkService {
  /**
   * Solicita un magic link. Si el correo existe, invalida enlaces previos y envía uno nuevo.
   * No revela si el correo está registrado (anti-enumeración).
   */
  async requestMagicLink(userEmail: string, language: AuthMailLanguage): Promise<void> {
    const normalizedEmail = userEmail.trim().toLowerCase()

    const user = await User.query()
      .where('user_email', normalizedEmail)
      .where('user_active', 1)
      .whereNull('user_deleted_at')
      .preload('person')
      .first()

    if (!user) {
      return
    }

    await ApiToken.query()
      .where('tokenable_id', user.userId)
      .where('type', 'magic_link')
      .delete()

    const magicToken = await User.magicLinkTokens.create(user, undefined, {
      expiresIn: User.magicLinkTokenExpiresIn(),
    })

    const tokenValue = magicToken.value!.release()
    const backofficeUrl = env.get('BACKOFFICE_URL') ?? DEFAULT_BACKOFFICE_URL
    const magicLinkUrl = `${backofficeUrl.replace(/\/$/, '')}/auth/magic-link?token=${encodeURIComponent(tokenValue)}`

    const firstName = user.person?.personFirstname || user.userEmail

    const authMailService = new AuthMailService()
    await authMailService.sendMagicLink({
      to: user.userEmail,
      firstName,
      magicLinkUrl,
      language,
    })
  }

  /**
   * Consume un magic link de un solo uso y emite par access+refresh con origin web.
   */
  async verifyMagicLink(token: string): Promise<MagicLinkVerifyResult | null> {
    const verifiedToken = await User.magicLinkTokens.verify(new Secret(token))

    if (!verifiedToken || verifiedToken.isExpired()) {
      return null
    }

    const user = await User.query()
      .where('user_id', Number(verifiedToken.tokenableId))
      .where('user_active', 1)
      .whereNull('user_deleted_at')
      .preload('person')
      .first()

    if (!user) {
      return null
    }

    await User.magicLinkTokens.delete(user, verifiedToken.identifier)

    const authTokenService = new AuthTokenService()
    await authTokenService.revokeByOrigin(user.userId, MAGIC_LINK_ORIGIN)

    if (Ws.io) {
      try {
        Ws.io.emit(`user-forze-logout:${user.userEmail}:${MAGIC_LINK_ORIGIN}`, {})
      } catch (error) {
        logger.warn({ err: error }, 'MagicLinkService.verifyMagicLink: fallo al emitir force-logout')
      }
    }

    const { accessToken, refreshToken } = await authTokenService.issueTokenPair(user, MAGIC_LINK_ORIGIN)

    return { user, accessToken, refreshToken }
  }
}

import { Secret } from '@adonisjs/core/helpers'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import User from '#models/user'
import ApiToken from '#models/api_token'
import AuthMailService from '#services/auth_mail_service'
import AuthTokenService from '#services/auth_token_service'

const PLATFORM_ORIGIN = 'platform'
const DEFAULT_LANDLORD_URL = 'http://localhost:3001'

export interface PlatformMagicLinkVerifyResult {
  user: User
  accessToken: string
  refreshToken: string
}

/**
 * Servicio del flujo de magic link exclusivo para administradores de plataforma.
 * Espeja `MagicLinkService` con dos diferencias:
 *  - Verifica `isPlatformAdmin` antes de generar o consumir el enlace.
 *  - Emite sesión con `origin='platform'` en lugar de `'web'`.
 */
export default class PlatformMagicLinkService {
  /**
   * Solicita un magic link de plataforma.
   * Solo genera y envía el enlace si el correo pertenece a un administrador de
   * plataforma activo. En cualquier otro caso no produce ningún efecto visible.
   * Nunca revela si el correo existe (anti-enumeración).
   */
  async requestMagicLink(userEmail: string): Promise<void> {
    const normalizedEmail = userEmail.trim().toLowerCase()

    const user = await User.query()
      .where('user_email', normalizedEmail)
      .where('user_active', 1)
      .whereNull('user_deleted_at')
      .preload('person')
      .first()

    if (!user?.isPlatformAdmin) {
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
    const landlordUrl = env.get('LANDLORD_URL') ?? DEFAULT_LANDLORD_URL
    const magicLinkUrl = `${landlordUrl.replace(/\/$/, '')}/auth/magic-link?token=${encodeURIComponent(tokenValue)}`
    const firstName = user.person?.personFirstname || user.userEmail

    const authMailService = new AuthMailService()
    await authMailService.sendMagicLink({
      to: user.userEmail,
      firstName,
      magicLinkUrl,
      language: 'es',
    })
  }

  /**
   * Consume un magic link de plataforma de un solo uso.
   * Solo emite sesión `origin='platform'` si el token es válido y el usuario
   * tiene `isPlatformAdmin`. Devuelve `null` en cualquier otro caso.
   */
  async verifyMagicLink(token: string): Promise<PlatformMagicLinkVerifyResult | null> {
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

    if (!user?.isPlatformAdmin) {
      return null
    }

    await User.magicLinkTokens.delete(user, verifiedToken.identifier)

    const authTokenService = new AuthTokenService()
    await authTokenService.revokeByOrigin(user.userId, PLATFORM_ORIGIN)

    const { accessToken, refreshToken } = await authTokenService.issueTokenPair(user, PLATFORM_ORIGIN)

    logger.info(
      { userId: user.userId },
      'PlatformMagicLinkService.verifyMagicLink: sesión de plataforma emitida via magic link'
    )

    return { user, accessToken, refreshToken }
  }
}

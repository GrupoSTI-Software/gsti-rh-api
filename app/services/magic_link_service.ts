import { Secret } from '@adonisjs/core/helpers'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import User from '#models/user'
import ApiToken from '#models/api_token'
import AuthMailService, { type AuthMailLanguage } from '#services/auth_mail_service'
import AuthTokenService from '#services/auth_token_service'
import { canAccessBackoffice } from '#helpers/backoffice_access'
import Ws from '#services/ws'

const DEFAULT_BACKOFFICE_URL = 'http://127.0.0.1:3000'
const MAGIC_LINK_ORIGIN = 'web'
export interface MagicLinkVerifyResult {
  user: User
  accessToken: string
  refreshToken: string
}

/**
 * Desenlace de consumir un magic link. Se distingue `backoffice_forbidden` de
 * `invalid` porque el mensaje al usuario es distinto: un enlace caduco se
 * resuelve pidiendo otro, pero una cuenta de colaborador no entra al backoffice
 * por mucho que insista, y tratarla como enlace inválido la deja pidiendo
 * enlaces que ya nunca se le envían.
 */
export type MagicLinkVerifyOutcome =
  | { status: 'ok'; result: MagicLinkVerifyResult }
  | { status: 'invalid' }
  | { status: 'backoffice_forbidden' }

/**
 * Servicio del flujo de magic link: solicitud, envío de correo y consumo single-use.
 */
export default class MagicLinkService {
  /**
   * Solicita un magic link. Si el correo existe y la cuenta puede entrar al
   * backoffice, invalida enlaces previos y envía uno nuevo. No revela si el
   * correo está registrado ni con qué rol (anti-enumeración): todos los casos
   * que no envían salen en silencio.
   *
   * @param userEmail Correo tal como lo escribió quien pide el enlace.
   * @param language Idioma del correo.
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

    // El magic link es una puerta al backoffice: emite sesión con origin `web`
    // y el enlace apunta a `BACKOFFICE_URL`. Una cuenta de colaborador no entra
    // ahí ni con contraseña (`user_controller.login`), así que tampoco se le
    // manda el correo. Se sale igual que con un correo inexistente —en
    // silencio, con el 200 genérico del controlador— para no revelar por el
    // canal del magic link qué cuentas existen ni con qué rol.
    if (!(await canAccessBackoffice(user))) {
      logger.info(
        { userId: user.userId },
        'MagicLinkService.requestMagicLink: cuenta sin acceso al backoffice, no se envía el enlace'
      )
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
   * Consume un magic link de un solo uso y emite par access+refresh con origin
   * web. El token se consume aunque la cuenta resulte sin acceso al backoffice.
   *
   * @param token Valor del magic link recibido por correo.
   * @returns El desenlace: sesión emitida, enlace inválido, o cuenta sin acceso
   *   al backoffice.
   */
  async verifyMagicLink(token: string): Promise<MagicLinkVerifyOutcome> {
    const verifiedToken = await User.magicLinkTokens.verify(new Secret(token))

    if (!verifiedToken || verifiedToken.isExpired()) {
      return { status: 'invalid' }
    }

    const user = await User.query()
      .where('user_id', Number(verifiedToken.tokenableId))
      .where('user_active', 1)
      .whereNull('user_deleted_at')
      .preload('person')
      .first()

    if (!user) {
      return { status: 'invalid' }
    }

    await User.magicLinkTokens.delete(user, verifiedToken.identifier)

    // El rol pudo cambiar entre el envío y el consumo: el enlace vive 15
    // minutos y degradar una cuenta a colaborador es cosa de un clic. Bloquear
    // solo el envío dejaría abierta esa ventana, así que el gate se repite aquí
    // sobre el estado actual. El token ya se consumió arriba: no queda vivo un
    // enlace que de todas formas no sirve.
    if (!(await canAccessBackoffice(user))) {
      logger.info(
        { userId: user.userId },
        'MagicLinkService.verifyMagicLink: cuenta sin acceso al backoffice, enlace rechazado'
      )
      return { status: 'backoffice_forbidden' }
    }

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

    return { status: 'ok', result: { user, accessToken, refreshToken } }
  }
}

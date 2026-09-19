import { HttpContext } from '@adonisjs/core/http'
import i18nManager from '@adonisjs/i18n/services/main'
import MagicLinkService from '#services/magic_link_service'
import { AUTH_LOGIN_ERRORS } from '#constants/auth_login_error_codes'
import type { AuthMailLanguage } from '#services/auth_mail_service'

/**
 * Controlador del flujo de magic link para acceso sin contraseña al backoffice.
 */
export default class MagicLinkController {
  /**
   * El servicio entra por constructor para que las pruebas puedan ejercer el
   * contrato HTTP —que es lo que consume el backoffice— sin base de datos. En
   * runtime Adonis instancia el controlador sin argumentos y toma el default.
   */
  constructor(private readonly magicLinkService: MagicLinkService = new MagicLinkService()) {}

  private buildRequestResponse(language: AuthMailLanguage) {
    const i18n = i18nManager.locale(language)
    return {
      type: 'success' as const,
      title: i18n.formatMessage('magic_link_title'),
      message: i18n.formatMessage('magic_link_request_message'),
      data: null,
    }
  }

  /**
   * @swagger
   * /api/auth/magic-link/request:
   *   post:
   *     tags:
   *       - Users
   *     summary: Solicitar enlace mágico de acceso
   *     description: |
   *       Endpoint público que siempre responde 200 para evitar enumeración de correos.
   *       Si el usuario existe y puede entrar al backoffice, invalida magic links
   *       previos y envía uno nuevo por correo. A las cuentas de colaborador no se
   *       les envía nada: su acceso es la app del empleado.
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userEmail
   *             properties:
   *               userEmail:
   *                 type: string
   *               language:
   *                 type: string
   *                 enum: [es, en]
   *     responses:
   *       '200':
   *         description: Respuesta genérica (siempre igual)
   */
  async request({ request, response }: HttpContext) {
    const languageInput = request.input('language', 'es')
    const language: AuthMailLanguage = languageInput === 'en' ? 'en' : 'es'

    try {
      const userEmail = request.input('userEmail')

      if (!userEmail || typeof userEmail !== 'string' || !userEmail.includes('@')) {
        response.status(200)
        return this.buildRequestResponse(language)
      }

      await this.magicLinkService.requestMagicLink(userEmail, language)

      response.status(200)
      return this.buildRequestResponse(language)
    } catch {
      response.status(200)
      return this.buildRequestResponse(language)
    }
  }

  /**
   * @swagger
   * /api/auth/magic-link/verify:
   *   post:
   *     tags:
   *       - Users
   *     summary: Consumir enlace mágico (single-use)
   *     description: |
   *       Valida y consume el magic link, emite par access+refresh con origin web
   *       y respeta sesión única por origen.
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - token
   *             properties:
   *               token:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Sesión iniciada exitosamente
   *       '400':
   *         description: Token no enviado
   *       '401':
   *         description: Enlace inválido, expirado o ya usado
   *       '403':
   *         description: La cuenta es de colaborador y no entra al backoffice
   */
  async verify({ request, response, i18n }: HttpContext) {
    try {
      const token = request.input('token')

      if (!token || typeof token !== 'string') {
        response.status(400)
        return {
          type: 'error',
          title: i18n.formatMessage('magic_link_token_missing_title'),
          detail: i18n.formatMessage('magic_link_token_missing_detail'),
          key: 'AUTH.MAGIC_LINK.MISSING',
          data: null,
        }
      }

      const outcome = await this.magicLinkService.verifyMagicLink(token)

      // Mismo contrato que el 403 del login con contraseña
      // (`user_controller.login`): el backoffice ya sabe leer esa clave, y al
      // colaborador le llega el mismo mensaje entre por donde entre.
      if (outcome.status === 'backoffice_forbidden') {
        response.status(403)
        return {
          type: 'warning',
          title: AUTH_LOGIN_ERRORS.BACKOFFICE_FORBIDDEN.title,
          detail: AUTH_LOGIN_ERRORS.BACKOFFICE_FORBIDDEN.detail,
          key: AUTH_LOGIN_ERRORS.BACKOFFICE_FORBIDDEN.key,
          data: null,
        }
      }

      if (outcome.status === 'invalid') {
        response.status(401)
        return {
          type: 'warning',
          title: i18n.formatMessage('magic_link_invalid_title'),
          detail: i18n.formatMessage('magic_link_invalid_detail'),
          key: 'AUTH.MAGIC_LINK.INVALID',
          data: null,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('magic_link_title'),
        message: i18n.formatMessage('magic_link_success_message'),
        data: {
          user: outcome.result.user,
          token: outcome.result.accessToken,
          refreshToken: outcome.result.refreshToken,
        },
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('server_error'),
        message: i18n.formatMessage('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
}

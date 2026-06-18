import { HttpContext } from '@adonisjs/core/http'
import i18nManager from '@adonisjs/i18n/services/main'
import MagicLinkService from '#services/magic_link_service'
import type { AuthMailLanguage } from '#services/auth_mail_service'

/**
 * Controlador del flujo de magic link para acceso sin contraseña al backoffice.
 */
export default class MagicLinkController {
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
   *       Si el usuario existe, invalida magic links previos y envía uno nuevo por correo.
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

      const magicLinkService = new MagicLinkService()
      await magicLinkService.requestMagicLink(userEmail, language)

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

      const magicLinkService = new MagicLinkService()
      const result = await magicLinkService.verifyMagicLink(token)

      if (!result) {
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
          user: result.user,
          token: result.accessToken,
          refreshToken: result.refreshToken,
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

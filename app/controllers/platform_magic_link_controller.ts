import type { HttpContext } from '@adonisjs/core/http'
import PlatformMagicLinkService from '#services/platform_magic_link_service'
import { platformMagicLinkRequestValidator, platformMagicLinkVerifyValidator } from '#validators/platform_magic_link'

/** Respuesta genérica de solicitud (anti-enumeración). */
const REQUEST_GENERIC_RESPONSE = {
  type: 'success' as const,
  title: 'Enlace de acceso',
  message: 'Si tu correo está registrado, recibirás las instrucciones en breve.',
  data: null,
}

/**
 * Controlador del flujo de magic link exclusivo para la consola interna de plataforma.
 * Todos los endpoints son públicos; la elegibilidad (`isPlatformAdmin`) se valida
 * internamente, nunca se expone en la respuesta.
 */
export default class PlatformMagicLinkController {
  /**
   * @swagger
   * /api/platform/auth/magic-link/request:
   *   post:
   *     tags:
   *       - Platform Auth
   *     summary: Solicitar enlace de acceso de plataforma
   *     description: |
   *       Endpoint público. Genera y envía el enlace al correo **únicamente** si la cuenta
   *       pertenece a un administrador de plataforma activo. En cualquier otro caso no produce
   *       ningún efecto. Siempre responde 200 con el mismo cuerpo genérico (anti-enumeración).
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userEmail
   *             properties:
   *               userEmail:
   *                 type: string
   *                 format: email
   *                 example: admin@gruposti.com
   *     responses:
   *       '200':
   *         description: Respuesta genérica (idéntica para admin y no-admin)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Enlace de acceso
   *                 message:
   *                   type: string
   *                   example: Si tu correo está registrado, recibirás las instrucciones en breve.
   *                 data:
   *                   nullable: true
   */
  async request({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(platformMagicLinkRequestValidator)
      const service = new PlatformMagicLinkService()
      await service.requestMagicLink(data.userEmail)
    } catch {
      // cualquier error (validación, SMTP, BD) se descarta para no filtrar info
    }

    return response.status(200).json(REQUEST_GENERIC_RESPONSE)
  }

  /**
   * @swagger
   * /api/platform/auth/magic-link/verify:
   *   post:
   *     tags:
   *       - Platform Auth
   *     summary: Verificar enlace de acceso de plataforma (single-use)
   *     description: |
   *       Consume el magic link de un solo uso y emite una sesión de plataforma
   *       (`origin='platform'`). Solo produce sesión si el token es válido, no está
   *       expirado y la cuenta es administrador de plataforma. En cualquier otro caso
   *       responde 401.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - token
   *             properties:
   *               token:
   *                 type: string
   *                 description: Token del magic link recibido en el correo
   *     responses:
   *       '200':
   *         description: Sesión de plataforma emitida
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 token:
   *                   type: string
   *                   description: Access token Bearer (TTL 15 min)
   *                 refreshToken:
   *                   type: string
   *                   description: Refresh token single-use (TTL 7 días)
   *                 user:
   *                   type: object
   *                   description: Datos del administrador con persona precargada
   *       '401':
   *         description: Token inválido, expirado, ya usado, o cuenta sin marcador
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Enlace inválido
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.MAGIC_LINK.INVALID
   */
  async verify({ request, response }: HttpContext) {
    const data = await request.validateUsing(platformMagicLinkVerifyValidator)

    const service = new PlatformMagicLinkService()
    const result = await service.verifyMagicLink(data.token)

    if (!result) {
      return response.status(401).json({
        title: 'Enlace inválido',
        detail: 'El enlace de acceso no es válido, ya fue usado o expiró.',
        key: 'AUTH.PLATFORM.MAGIC_LINK.INVALID',
      })
    }

    return response.status(200).json({
      token: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    })
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import { resolveEmployeeBadgeApiError } from '#helpers/employee_badge_api_error'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import BadgeService from './badge.service.js'

/**
 * Controlador público de verificación del gafete (E4, USRH1784686362321).
 *
 * Aislado a propósito: jamás importa modelos Lucid completos ni preloads.
 * Sin `auth()`/`businessScope()` — el token ES la autorización. Superficie
 * mínima (5 campos, dos nullables); `Cache-Control: no-store` porque la
 * vigencia es dato vivo.
 */
export default class BadgePublicController {
  /**
   * @swagger
   * /api/public/employee-badge/verify/{token}:
   *   get:
   *     summary: Verificación pública del gafete (sin cuenta ni sesión)
   *     description: |
   *       El QR del gafete codifica `${BACKOFFICE_URL}/badge-verification/<token>`;
   *       esta ruta es la que consume esa página. Un token inexistente, con
   *       formato inválido o revocado responde siempre el mismo 404
   *       (indistinguibles, regla 7). Un trabajador dado de baja o una
   *       empresa desactivada responde `200` con `vinculoVigente: false`
   *       (regla 11) — nunca 404. Limitada a 10 solicitudes/minuto por IP.
   *     tags: [EmployeeBadgePublic]
   *     security: []
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema: { type: string }
   *         description: "Código de verificación de 43 caracteres (`randomBytes(32).toString('base64url')`)."
   *     responses:
   *       '200':
   *         description: Verificación resuelta (con o sin folio REPSE, según registro de la empresa).
   *         content:
   *           application/json:
   *             examples:
   *               conFolio:
   *                 summary: Empresa con registro REPSE, vínculo vigente
   *                 value:
   *                   type: success
   *                   title: Verificación de gafete
   *                   message: Gafete verificado
   *                   data:
   *                     verificacion:
   *                       trabajador: "Juan Pérez García"
   *                       empresa: "Seguridad Integral SA de CV"
   *                       vinculoVigente: true
   *                       folioRepse: "REPSE-12345-2024"
   *                       folioVigente: true
   *               vinculoNoVigente:
   *                 summary: Trabajador dado de baja o empresa desactivada (regla 11)
   *                 value:
   *                   type: success
   *                   title: Verificación de gafete
   *                   message: Gafete verificado
   *                   data:
   *                     verificacion:
   *                       trabajador: "María López Hernández"
   *                       empresa: "Limpieza Corporativa del Bajío S.A."
   *                       vinculoVigente: false
   *                       folioRepse: "REPSE-90871-2022"
   *                       folioVigente: false
   *       '404':
   *         description: Token inexistente, con formato inválido o revocado (indistinguibles, regla 7).
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: El código de verificación no existe, es inválido o fue revocado.
   *               detail: El código de verificación no existe, es inválido o fue revocado.
   *               key: verificacion-no-encontrada
   *               errorCode: BDG.NF.002
   *               data: null
   *       '429':
   *         description: Límite de 10 solicitudes/minuto por IP excedido (formato estándar de `@adonisjs/limiter`).
   *       '500':
   *         description: Error no controlado.
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Error
   *               message: Error inesperado
   *               errorCode: BDG.SYS.001
   *               data: null
   */
  async verify(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    response.header('Cache-Control', 'no-store')
    try {
      const service = new BadgeService()
      const verificacion = await service.getVerification(params.token)

      return StandardResponseFormatter.success(
        response,
        verificacion,
        i18n.t('employee_badge_verification_title', undefined, 'Verificación de gafete'),
        i18n.t('employee_badge_verified_successfully', undefined, 'Gafete verificado'),
        200,
        'verificacion'
      )
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveEmployeeBadgeApiError(error, fallback, i18n)
    const body: Record<string, unknown> = {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      errorCode: resolved.errorCode,
      data: null,
    }
    if (resolved.key) {
      body.key = resolved.key
      body.detail = resolved.message
    }
    return response.status(resolved.status).json(body)
  }
}

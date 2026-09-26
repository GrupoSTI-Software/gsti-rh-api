import { HttpContext } from '@adonisjs/core/http'
import StateService from '#modules/onboarding/state/state.service'

/**
 * Controller del sub-módulo de catálogo de onboarding.
 * Expone el panorama del usuario (GET /api/onboarding/me), que combina
 * la lectura del catálogo (flujos/pasos activos) con el estado del usuario.
 *
 * Seguridad: requiere middleware.auth(). El userId se obtiene de auth.user;
 * no se acepta userId del cliente (anti-IDOR de raíz).
 */
export default class CatalogController {
  /**
   * @swagger
   * /api/onboarding/me:
   *   get:
   *     summary: Panorama del onboarding del usuario autenticado
   *     description: |
   *       Devuelve el estado global del onboarding, la intención elegida (si existe),
   *       las intenciones disponibles y la secuencia aplicable de pasos con su avance.
   *       Si el usuario no tiene estado de onboarding, se crea con status "pending".
   *     security:
   *       - bearerAuth: []
   *     tags: [Onboarding]
   *     responses:
   *       200:
   *         description: Panorama del onboarding
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
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     status:
   *                       type: string
   *                       enum: [pending, in_progress, completed, dismissed]
   *                     intent:
   *                       type: string
   *                       nullable: true
   *                       description: Slug de la intención elegida o null
   *                     availableIntents:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           slug: { type: string }
   *                           name: { type: string }
   *                           order: { type: integer }
   *                     steps:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           slug: { type: string }
   *                           name: { type: string }
   *                           flowSlug: { type: string, nullable: true }
   *                           order: { type: integer }
   *                           skippable: { type: boolean }
   *                           completionHint: { type: string, nullable: true }
   *                           progress:
   *                             type: string
   *                             enum: [pending, completed, skipped]
   *       401:
   *         description: No autenticado
   */
  async me(ctx: HttpContext) {
    const userId = ctx.auth.user!.userId
    const service = new StateService()
    const data = await service.getOnboardingMe(userId)

    return ctx.response.status(200).json({
      type: 'success',
      title: 'Onboarding',
      message: 'Panorama del onboarding obtenido correctamente.',
      data,
    })
  }
}

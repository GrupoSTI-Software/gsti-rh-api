import { HttpContext } from '@adonisjs/core/http'
import { requestTrialAccessValidator } from './validators/request_trial_access.validator.js'
import TrialAccessService from './trial_access.service.js'

/**
 * Controlador del paso "Pruébalo como tu empleado" del onboarding.
 *
 * Genera un magic link de vida corta (30 min) para el usuario del empleado
 * creado en el tronco común, sin enviar correo.
 * El admin puede mostrarlo como QR o link copiable para probarlo desde el celular.
 */
export default class TrialAccessController {
  /**
   * @swagger
   * /api/onboarding/me/trial-access:
   *   post:
   *     tags:
   *       - Onboarding
   *     summary: Generar acceso temporal para probar como empleado
   *     description: |
   *       Genera un magic link de vida corta (30 min, un solo uso) para el usuario
   *       del empleado indicado. El link reutiliza el endpoint existente
   *       `/auth/magic-link/verify` y no requiere contraseña.
   *       Solo el admin autenticado puede generar este acceso.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userId
   *             properties:
   *               userId:
   *                 type: integer
   *                 description: ID del usuario del empleado a probar
   *     responses:
   *       '200':
   *         description: Acceso temporal generado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     trialUrl:
   *                       type: string
   *                     expiresAt:
   *                       type: string
   *                       format: date-time
   *                     expiresInSeconds:
   *                       type: integer
   *       '404':
   *         description: Usuario no encontrado o inactivo
   *       '422':
   *         description: Parámetros inválidos
   */
  async generate({ request, response, i18n }: HttpContext) {
    let payload: { userId: number }
    try {
      payload = await requestTrialAccessValidator.validate(request.all())
    } catch {
      response.status(422)
      return {
        type: 'error',
        title: i18n.formatMessage('onboarding.trial_access_invalid_params_title'),
        detail: i18n.formatMessage('onboarding.trial_access_invalid_params_detail'),
        key: 'TRIAL.INVALID_PARAMS',
        data: null,
      }
    }

    try {
      const service = new TrialAccessService()
      const result = await service.generateTrialAccess(payload.userId)

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('onboarding.trial_access_title'),
        detail: i18n.formatMessage('onboarding.trial_access_detail'),
        data: result,
      }
    } catch (error: any) {
      if (error?.message === 'TRIAL.USER_NOT_FOUND') {
        response.status(404)
        return {
          type: 'error',
          title: i18n.formatMessage('onboarding.trial_access_user_not_found_title'),
          detail: i18n.formatMessage('onboarding.trial_access_user_not_found_detail'),
          key: 'TRIAL.USER_NOT_FOUND',
          data: null,
        }
      }
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('server_error'),
        detail: i18n.formatMessage('an_unexpected_error_has_occurred_on_the_server'),
        key: 'TRIAL.INTERNAL_ERROR',
        data: null,
      }
    }
  }
}

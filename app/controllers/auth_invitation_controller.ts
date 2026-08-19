import type { HttpContext } from '@adonisjs/core/http'
import { errors as vineErrors } from '@vinejs/vine'
import AuthInvitationService from '#services/auth_invitation_service'
import { invitationSetPasswordValidator } from '#validators/auth_invitation'
import { AUTH_INVITATION_ERRORS } from '#constants/user_invitation_error_codes'
import { AuthInvitationServiceError } from '#exceptions/auth_invitation_service_error'
import { respondAuthInvitationError } from '#helpers/auth_invitation_response'

/**
 * Controlador público del flujo de aceptación de invitación (USRH1786736057525).
 */
export default class AuthInvitationController {
  /**
   * @swagger
   * /api/auth/invitation/verify/{token}:
   *   post:
   *     security: []
   *     tags:
   *       - Auth Invitation
   *     summary: Verificar enlace de invitación
   *     description: |
   *       Endpoint público sin sesión ni `x-business-unit-id`.
   *       Valida que el token exista, no haya vencido y no haya sido consumido.
   *       Devuelve el mínimo para ubicar a la persona invitada.
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Enlace vigente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 businessUnitName:
   *                   type: string
   *                 userEmailMasked:
   *                   type: string
   *       '404':
   *         description: Enlace inexistente, vencido o ya consumido (respuesta indistinguible)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   *       '429':
   *         description: Demasiados intentos
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   */
  async verify({ params, response }: HttpContext) {
    const token = params.token

    if (!token || typeof token !== 'string' || !token.trim()) {
      return respondAuthInvitationError(response, AUTH_INVITATION_ERRORS.INVALID_LINK)
    }

    try {
      const authInvitationService = new AuthInvitationService()
      const result = await authInvitationService.verify(token.trim())
      return response.status(200).json(result)
    } catch (error) {
      if (error instanceof AuthInvitationServiceError) {
        return respondAuthInvitationError(response, error.definition)
      }

      throw error
    }
  }

  /**
   * @swagger
   * /api/auth/invitation/set-password:
   *   post:
   *     security: []
   *     tags:
   *       - Auth Invitation
   *     summary: Fijar contraseña de invitación
   *     description: |
   *       Endpoint público que recibe token + contraseña + confirmación.
   *       Hashea la contraseña vía mixin del modelo, marca `user_password_set_at`
   *       y consume el enlace. No emite sesión.
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - token
   *               - userPassword
   *               - userPasswordConfirm
   *             properties:
   *               token:
   *                 type: string
   *               userPassword:
   *                 type: string
   *               userPasswordConfirm:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Contraseña fijada y enlace consumido
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 passwordSet:
   *                   type: boolean
   *       '404':
   *         description: Enlace inexistente, vencido o ya consumido
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   *       '422':
   *         description: Contraseña inválida o confirmación distinta
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   *       '429':
   *         description: Demasiados intentos
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 code:
   *                   type: string
   */
  async setPassword({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(invitationSetPasswordValidator)

      const authInvitationService = new AuthInvitationService()
      const result = await authInvitationService.setPassword(
        data.token,
        data.userPassword,
        data.userPasswordConfirm
      )

      return response.status(200).json(result)
    } catch (error) {
      if (error instanceof AuthInvitationServiceError) {
        return respondAuthInvitationError(response, error.definition)
      }

      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        return respondAuthInvitationError(response, AUTH_INVITATION_ERRORS.PASSWORD_POLICY)
      }

      throw error
    }
  }
}

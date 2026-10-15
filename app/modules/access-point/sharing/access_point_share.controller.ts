import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { resolvePlatformDeviceApiError } from '#helpers/platform_device_api_error'
import AccessPointShareService from './access_point_share.service.js'

const assignmentValidator = vine.compile(
  vine.object({
    params: vine.object({ assignmentId: vine.number().positive() }),
  })
)

const grantValidator = vine.compile(
  vine.object({
    params: vine.object({ assignmentId: vine.number().positive() }),
    businessUnitPublicId: vine.string().trim().uuid(),
  })
)

const revokeValidator = vine.compile(
  vine.object({
    params: vine.object({
      assignmentId: vine.number().positive(),
      shareId: vine.number().positive(),
    }),
  })
)

/**
 * Invitaciones de empresas del grupo a un checador, desde el landlord
 * (VLRH-P0065, 5). Todas tras `auth` + `platformAdmin`; los errores salen con
 * titulo / detalle / key como el resto del inventario de dispositivos.
 */
export default class AccessPointShareController {
  private readonly service = new AccessPointShareService()

  /**
   * @swagger
   * /api/platform/device-assignments/{assignmentId}/shares:
   *   get:
   *     tags:
   *       - Platform Device Assignments
   *     summary: Invitaciones del checador de una entrega
   *     description: >
   *       Historial de invitaciones (vivas y revocadas) y empresas del grupo de
   *       la responsable a las que todavia se puede invitar. `outsideGroup`
   *       marca una invitacion viva cuya invitada ya no comparte grupo.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Invitaciones y candidatas
   *       '409':
   *         description: unidad-sin-asignacion
   */
  async index({ request, response }: HttpContext) {
    try {
      const { params } = await request.validateUsing(assignmentValidator, {
        data: { params: request.params() },
      })
      const data = await this.service.list(params.assignmentId)
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/device-assignments/{assignmentId}/shares:
   *   post:
   *     tags:
   *       - Platform Device Assignments
   *     summary: Invitar a una empresa del grupo al checador
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [businessUnitPublicId]
   *             properties:
   *               businessUnitPublicId:
   *                 type: string
   *                 format: uuid
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '201':
   *         description: Invitacion otorgada
   *       '409':
   *         description: unidad-sin-asignacion | invitacion-duplicada
   *       '422':
   *         description: empresa-fuera-del-grupo | PLT.DEV.VAL_INPUT
   */
  async store({ auth, request, response }: HttpContext) {
    try {
      const { params, businessUnitPublicId } = await request.validateUsing(grantValidator, {
        data: { ...request.body(), params: request.params() },
      })
      const data = await this.service.grant({
        platformDeviceAssignmentId: params.assignmentId,
        businessUnitPublicId,
        userId: auth.getUserOrFail().userId,
      })
      return response.status(201).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/device-assignments/{assignmentId}/shares/{shareId}:
   *   delete:
   *     tags:
   *       - Platform Device Assignments
   *     summary: Revocar una invitacion
   *     description: >
   *       Encola la baja en el aparato de cada colaborador vivo de la invitada.
   *       Los templates de la boveda no se tocan.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Invitacion revocada
   *       '404':
   *         description: invitacion-no-encontrada
   *       '409':
   *         description: unidad-sin-asignacion
   */
  async destroy({ auth, request, response }: HttpContext) {
    try {
      const { params } = await request.validateUsing(revokeValidator, {
        data: { params: request.params() },
      })
      const data = await this.service.revoke({
        platformDeviceAssignmentId: params.assignmentId,
        accessPointShareId: params.shareId,
        userId: auth.getUserOrFail().userId,
      })
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }
}

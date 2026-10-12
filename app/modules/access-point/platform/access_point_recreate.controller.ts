import type { HttpContext } from '@adonisjs/core/http'
import { resolvePlatformDeviceApiError } from '#helpers/platform_device_api_error'
import AccessPointRecreateService from './access_point_recreate.service.js'

/**
 * Recrear el punto de acceso de una unidad entregada cuya empresa lo borro.
 *
 * Detras de `platformAdmin` como el resto de `/units`: es el panel quien
 * repara la entrega, no el administrador de la empresa.
 */
export default class AccessPointRecreateController {
  private readonly service = new AccessPointRecreateService()

  /**
   * @swagger
   * /api/platform/devices/units/{platformDeviceId}/access-point:
   *   post:
   *     tags:
   *       - Platform Device Inventory
   *     summary: Recrea el punto de acceso de una unidad entregada
   *     description: >
   *       Crea el punto de acceso de la empresa que tiene la unidad, revive el
   *       que borro o adopta el que ya exista. Repetirlo no duplica nada.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: platformDeviceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: data.outcome (created, adopted, restored) y data.accessPoint
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: AUTH.PLATFORM.FORBIDDEN
   *       '404':
   *         description: PLT.DEV.DEVICE_NOT_FOUND
   *       '409':
   *         description: PLT.DEV.SERIAL_TAKEN_BY_OTHER_TENANT o PLT.DEV.SERIAL_TAKEN_BY_AUTODISCOVERY
   *       '422':
   *         description: PLT.DEV.NO_OPEN_ASSIGNMENT
   */
  async store({ params, response }: HttpContext) {
    try {
      const result = await this.service.recreate(Number(params.platformDeviceId))
      return response.status(200).json({ type: 'success', data: result })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }
}

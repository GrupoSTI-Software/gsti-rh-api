import type { HttpContext } from '@adonisjs/core/http'
import { resolvePlatformDeviceApiError } from '#helpers/platform_device_api_error'
import DeviceChannelSecretService from './device_channel_secret.service.js'

/**
 * Direccion propia del equipo, para quien lo instala.
 *
 * Vive bajo `/units` porque se pregunta por la unidad del inventario, pero es
 * asunto del canal y no del catalogo: por eso el controlador esta en el modulo
 * de puntos de acceso. Detras de `platformAdmin` como el resto del prefijo --
 * el secreto de un equipo no lo puede leer el administrador de la empresa que
 * lo tiene, y mucho menos el de otra.
 */
export default class DeviceChannelSecretController {
  private readonly service = new DeviceChannelSecretService()

  /**
   * @swagger
   * /api/platform/devices/units/{platformDeviceId}/channel-secret:
   *   get:
   *     tags:
   *       - Platform Device Inventory
   *     summary: Direccion del canal del equipo, para teclearla en el aparato
   *     description: >
   *       El secreto se guarda cifrado y sin hashear a proposito: quien instala
   *       o repone un checador tiene que poder volver a leerlo. `hasSecret` en
   *       falso es un equipo anterior al canal propio, que sigue atendido
   *       durante la convivencia pero no tiene direccion que teclear.
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
   *         description: Direccion del canal en data.deviceChannel
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: AUTH.PLATFORM.FORBIDDEN
   *       '404':
   *         description: PLT.DEV.DEVICE_NOT_FOUND
   *       '409':
   *         description: PLT.DEV.ACCESS_POINT_ABSENT
   *       '422':
   *         description: PLT.DEV.NO_OPEN_ASSIGNMENT
   */
  async show({ params, response }: HttpContext) {
    /**
     * El secreto no se guarda en ningun cache intermedio ni en el del
     * navegador: es la credencial del equipo y viaja en claro por definicion
     * (misma convencion que los gafetes, `badge.controller.ts:251`).
     */
    response.header('Cache-Control', 'private, no-store')

    try {
      const deviceChannel = await this.service.show(Number(params.platformDeviceId))
      return response.status(200).json({ type: 'success', data: { deviceChannel } })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }
}

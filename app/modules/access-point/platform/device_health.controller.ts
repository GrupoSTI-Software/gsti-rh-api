import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { resolvePlatformDeviceApiError } from '#helpers/platform_device_api_error'
import { TenantContext } from '#utils/tenant_context'
import HealthService from '#modules/access-point/health/health.service'
import ActiveAccessPointService from './active_access_point.service.js'

const UNSCOPED_REASON =
  'estado del equipo: plataforma consulta el punto de acceso de cualquier empresa'

/**
 * Estado de conexion de una unidad del inventario.
 *
 * El tablero de plataforma ya tiene `/health`, pero recorre el parque entero y
 * arma el diagnostico completo de cada equipo: pedirlo para pintar una ficha
 * es traer quinientos para mirar uno. Esta ruta responde por la unidad que se
 * esta viendo.
 */
export default class DeviceHealthController {
  private readonly active = new ActiveAccessPointService()
  private readonly health = new HealthService()

  /**
   * @swagger
   * /api/platform/devices/units/{platformDeviceId}/health:
   *   get:
   *     tags:
   *       - Platform Device Inventory
   *     summary: Estado de conexion del equipo entregado en esta unidad
   *     description: >
   *       `status` es `online` con latido en el ultimo minuto, `offline` si
   *       dejo de reportar y `never` si nunca llamo -- que casi siempre es red
   *       o configuracion, no una averia.
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
   *         description: Estado del equipo en data.health
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
    try {
      const { accessPoint } = await this.active.resolve(Number(params.platformDeviceId))

      const health = await TenantContext.runUnscoped(
        () => this.health.buildFor(accessPoint, DateTime.utc()),
        UNSCOPED_REASON
      )

      return response.status(200).json({ type: 'success', data: { health } })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }
}

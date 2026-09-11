import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import {
  ensureAccessPointPermission,
  resolveScopedAccessPoint,
} from '#modules/access-point/access_point_authorization'
import { accessPointParamValidator } from '#modules/access-point/upload-progress/validators/access_point_param.validator'
import DeviceProfileRepositoryMysql from './device_profile.repository.mysql.js'
import { toDeviceProfileDto } from './dto/device_profile.dto.js'

/** Perfil del checador (spec 9.1 y 11). Lectura con `read-health`. */
export default class DeviceProfileController {
  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/profile:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Perfil que el checador declaro en options
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         required: true
   *         schema: { type: number }
   *     responses:
   *       200:
   *         description: Perfil en data.profile (available=false si el equipo nunca ha contactado)
   *       403:
   *         description: Sin permiso read-health (key sin-permiso)
   *       404:
   *         description: Punto de acceso fuera de alcance (key punto-acceso-no-encontrado)
   */
  async show(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth)
      const { params } = await request.validateUsing(accessPointParamValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)
      const repository = new DeviceProfileRepositoryMysql()
      const profile = await repository.findByAccessPoint(accessPoint.accessPointId)
      return StandardResponseFormatter.success(
        response,
        toDeviceProfileDto(accessPoint.accessPointId, profile),
        i18n.formatMessage('access_point_profile_title'),
        i18n.formatMessage('access_point_profile_message'),
        200,
        'profile'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}

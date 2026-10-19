import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import {
  ensureAccessPointPermission,
  resolveParticipantAccessPoint,
} from '#modules/access-point/access_point_authorization'
import { TenantContext } from '#utils/tenant_context'
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
      // Lectura para cualquier participante; el perfil es del aparato y se lee
      // en su scope.
      const { accessPoint, deviceScope, role } = await resolveParticipantAccessPoint(
        ctx,
        params.accessPointId
      )
      const repository = new DeviceProfileRepositoryMysql()
      const profile = await TenantContext.run(deviceScope, () =>
        repository.findByAccessPoint(accessPoint.accessPointId)
      )
      const dto = toDeviceProfileDto(accessPoint.accessPointId, profile)
      return StandardResponseFormatter.success(
        response,
        // La IP desde la que reporta el aparato es de la red de la responsable.
        role === 'guest' ? { ...dto, lastIpSeen: null, lastIpSeenAt: null } : dto,
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

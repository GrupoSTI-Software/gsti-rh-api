import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import {
  ensureAccessPointPermission,
  resolveScopedAccessPoint,
} from '#modules/access-point/access_point_authorization'
import { accessPointParamValidator } from '#modules/access-point/upload-progress/validators/access_point_param.validator'
import { toDeviceCommandDto } from '#modules/device-commands/dto/device_command.dto'
import DeviceClockSyncService from './device_clock_sync.service.js'

/** Ajuste manual del reloj de un checador (spec ADMS 6.7 y 11). */
export default class DeviceClockController {
  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/clock-sync:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Encola el ajuste de la hora del checador
   *     description: >
   *       La hora se calcula en el momento del despacho, no aqui. El comando
   *       queda acusado hasta que una checada real demuestre que la hora quedo
   *       bien: el acuse del equipo es identico con la hora buena y con la mala.
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         required: true
   *         schema: { type: number }
   *     responses:
   *       200:
   *         description: Comando encolado o el que ya estaba, en data.command
   *       403:
   *         description: Sin permiso manage-commands (key sin-permiso)
   *       404:
   *         description: Punto de acceso fuera de alcance (key punto-acceso-no-encontrado)
   */
  async sync(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.manageCommands)
      const { params } = await request.validateUsing(accessPointParamValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)

      const service = new DeviceClockSyncService()
      const now = DateTime.utc()
      const outcome = await service.request({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        deviceZone: accessPoint.accessPointTimezone ?? null,
        now,
        requestedByUserId: auth.user?.userId ?? null,
        // Pedido a mano: no se aplica la espera ni el tope automatico.
        manual: true,
      })

      if (outcome.kind !== 'enqueued' && outcome.kind !== 'already_queued') {
        return StandardResponseFormatter.success(
          response,
          null,
          i18n.formatMessage('device_clock_title'),
          i18n.formatMessage('device_clock_not_queued_message'),
          200,
          'command'
        )
      }

      return StandardResponseFormatter.success(
        response,
        toDeviceCommandDto(
          outcome.command,
          accessPoint.accessPointLastConnection ?? null,
          now
        ),
        i18n.formatMessage('device_clock_title'),
        i18n.formatMessage(
          outcome.kind === 'enqueued'
            ? 'device_clock_queued_message'
            : 'device_clock_already_queued_message'
        ),
        200,
        'command'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}

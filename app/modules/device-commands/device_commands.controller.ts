import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import {
  ensureAccessPointPermission,
  resolveScopedAccessPoint,
} from '#modules/access-point/access_point_authorization'
import { accessPointParamValidator } from '#modules/access-point/upload-progress/validators/access_point_param.validator'
import { DEVICE_COMMAND_ERROR_CODES } from '#constants/device_command_error_codes'
import { DeviceCommandError } from '#exceptions/device_command_error'
import DeviceCommandService from './device_command.service.js'
import { toDeviceCommandDto } from './dto/device_command.dto.js'
import { DEVICE_COMMAND_STATUS, type DeviceCommandStatus } from './device_command.constants.js'

const commandParamValidator = vine.compile(
  vine.object({
    params: vine.object({
      accessPointId: vine.number().positive(),
      commandId: vine.number().positive(),
    }),
  })
)

const STATUSES = Object.values(DEVICE_COMMAND_STATUS)

/**
 * Comandos hacia un checador (spec ADMS 11). Lectura con `read-health`;
 * cancelar y reintentar con `manage-commands`.
 */
export default class DeviceCommandsController {
  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/commands:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Comandos encolados y resueltos de un checador
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         required: true
   *         schema: { type: number }
   *       - in: query
   *         name: status
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Lista en data.commands, sin el payload del comando
   *       403:
   *         description: Sin permiso read-health (key sin-permiso)
   *       404:
   *         description: Punto de acceso fuera de alcance (key punto-acceso-no-encontrado)
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth)
      const { params } = await request.validateUsing(accessPointParamValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)

      const requested = request.input('status')
      const status = STATUSES.includes(requested as DeviceCommandStatus)
        ? (requested as DeviceCommandStatus)
        : undefined

      const service = new DeviceCommandService()
      const commands = await service.listByDevice(accessPoint.accessPointId, status)
      const now = DateTime.utc()
      return StandardResponseFormatter.success(
        response,
        commands.map((command) =>
          toDeviceCommandDto(command, accessPoint.accessPointLastConnection ?? null, now)
        ),
        i18n.formatMessage('device_command_title'),
        i18n.formatMessage('device_command_list_message'),
        200,
        'commands'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/commands/{commandId}/cancel:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Cancela un comando que sigue pendiente
   *     responses:
   *       200:
   *         description: Comando cancelado en data.command
   *       409:
   *         description: El comando ya salio hacia el equipo (key comando-no-cancelable)
   */
  async cancel(ctx: HttpContext) {
    return this.mutate(ctx, 'cancel')
  }

  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/commands/{commandId}/retry:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Reintenta un comando que fallo
   *     responses:
   *       200:
   *         description: Comando devuelto a la cola en data.command
   *       409:
   *         description: El comando no fallo o agoto sus intentos (key comando-no-reintentable)
   */
  async retry(ctx: HttpContext) {
    return this.mutate(ctx, 'retry')
  }

  private async mutate(ctx: HttpContext, action: 'cancel' | 'retry') {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.manageCommands)
      const { params } = await request.validateUsing(commandParamValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)

      const service = new DeviceCommandService()
      /**
       * El comando se lee dentro del alcance y ademas se comprueba que sea de
       * ESTE punto de acceso: un id de otro equipo de la misma empresa no
       * puede cancelarse desde la ruta de este.
       *
       * La pertenencia va en la consulta. Antes se traia la lista del
       * dispositivo y se buscaba en memoria, pero esa lista esta topada a las
       * 200 mas recientes: un comando mas viejo respondia 404 y no se podia ni
       * cancelar ni reintentar. De paso, cada intento hidrataba 200 modelos y
       * descifraba sus payloads --posibles templates biometricos-- para tirar
       * 199.
       */
      const target = await service.findForDevice(params.commandId, accessPoint.accessPointId)
      if (!target) {
        throw new DeviceCommandError(
          i18n.formatMessage('device_command_not_found_title'),
          DEVICE_COMMAND_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
          404,
          'comando-no-encontrado',
          i18n.formatMessage('device_command_not_found_message')
        )
      }

      const updated =
        action === 'cancel'
          ? await service.cancel(target.deviceCommandId, auth.user?.userId ?? null)
          : await service.retry(target.deviceCommandId, auth.user?.userId ?? null)

      return StandardResponseFormatter.success(
        response,
        toDeviceCommandDto(updated, accessPoint.accessPointLastConnection ?? null, DateTime.utc()),
        i18n.formatMessage('device_command_title'),
        i18n.formatMessage(
          action === 'cancel' ? 'device_command_cancelled_message' : 'device_command_retry_message'
        ),
        200,
        'command'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}

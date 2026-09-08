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
import HealthService from './health.service.js'
import DeviceSyncService from './device_sync.service.js'

const idValidator = vine.compile(
  vine.object({ params: vine.object({ accessPointId: vine.number().positive() }) })
)

/**
 * Estado de los checadores (spec ADMS 9.2).
 *
 * Es lectura, pero resuelve el permiso con `evaluateEnforced` igual que todo lo
 * demas: el interruptor de exigencia del modulo esta apagado y `permissionGate`
 * dejaria ver el estado de los equipos a cualquier autenticado.
 */
export default class HealthController {
  /**
   * @swagger
   * /api/v1/access-points/health:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Estado de todos los checadores de la empresa
   *     responses:
   *       200:
   *         description: Lista en data.accessPoints
   */
  async index(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth)
      const service = new HealthService()
      const rows = await service.listFor(ctx.businessUnitScope ?? [], DateTime.utc())

      return StandardResponseFormatter.success(
        response,
        rows,
        i18n.formatMessage('access_point_health_title'),
        i18n.formatMessage('access_point_health_message'),
        200,
        'accessPoints'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/health:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Estado de un checador
   *     responses:
   *       200:
   *         description: Estado en data.accessPoint
   *       404:
   *         description: El equipo no esta en el alcance
   */
  async show(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth)
      const { params } = await request.validateUsing(idValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)

      const service = new HealthService()
      const row = await service.buildFor(accessPoint, DateTime.utc())

      return StandardResponseFormatter.success(
        response,
        row,
        i18n.formatMessage('access_point_health_title'),
        i18n.formatMessage('access_point_health_message'),
        200,
        'accessPoint'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/sync:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Le pide al checador que vuelva a reportar su ficha
   *     description: >
   *       Con ADMS el servidor no puede consultar al aparato: se le deja un
   *       INFO en la cola y se espera a que pase a recogerlo. Devuelve la ficha
   *       ya actualizada si contesto, y `outcome` dice que paso.
   *     responses:
   *       200:
   *         description: Ficha en data.accessPoint, con outcome answered, pending o failed
   *       404:
   *         description: El equipo no esta en el alcance
   */
  async sync(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth)
      const { params } = await request.validateUsing(idValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)

      const outcome = await new DeviceSyncService().requestAndWait({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        userId: auth.user?.userId ?? null,
      })

      /**
       * Se relee el equipo: si contesto, su ficha cambio mientras esperabamos.
       * Leer la instancia vieja mostraria justo lo que se pidio refrescar.
       */
      const fresh = await resolveScopedAccessPoint(ctx, params.accessPointId)
      const row = await new HealthService().buildFor(fresh, DateTime.utc())

      const messageKey =
        outcome.kind === 'answered'
          ? 'access_point_sync_answered_message'
          : outcome.kind === 'failed'
            ? 'access_point_sync_failed_message'
            : 'access_point_sync_pending_message'

      return StandardResponseFormatter.success(
        response,
        { ...row, sync: outcome },
        i18n.formatMessage('access_point_health_title'),
        i18n.formatMessage(messageKey),
        200,
        'accessPoint'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}

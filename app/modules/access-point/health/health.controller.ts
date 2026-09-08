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
}

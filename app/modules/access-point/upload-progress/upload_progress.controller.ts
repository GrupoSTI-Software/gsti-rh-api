import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import {
  ensureAccessPointPermission,
  resolveScopedAccessPoint,
} from '#modules/access-point/access_point_authorization'
import UploadProgressService from './upload_progress.service.js'
import { accessPointParamValidator } from './validators/access_point_param.validator.js'

/**
 * Avance de subida por tabla del checador (spec 4.4 y 11). Lectura con
 * `read-health`; reinicio con `reset-upload-progress`. Todo `:accessPointId`
 * se resuelve dentro del alcance de la peticion; fuera de el, 404.
 */
export default class UploadProgressController {
  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/upload-progress:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Avance de subida por tabla del checador
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         required: true
   *         schema: { type: number }
   *     responses:
   *       200:
   *         description: Lista en data.uploadProgress
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
      const service = new UploadProgressService()
      const progress = await service.list(accessPoint.accessPointId)
      return StandardResponseFormatter.success(
        response,
        progress,
        i18n.formatMessage('access_point_upload_progress_title'),
        i18n.formatMessage('access_point_upload_progress_message'),
        200,
        'uploadProgress'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/access-points/{accessPointId}/upload-progress/reset:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Pone en cero el avance de subida (experimental hasta la prueba 16.5)
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         required: true
   *         schema: { type: number }
   *     responses:
   *       200:
   *         description: Lista ya reiniciada en data.uploadProgress
   *       403:
   *         description: Sin permiso reset-upload-progress (key sin-permiso)
   *       404:
   *         description: Punto de acceso fuera de alcance (key punto-acceso-no-encontrado)
   */
  async reset(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        ACCESS_POINT_PERMISSION_DECLARATIONS.resetUploadProgress
      )
      const { params } = await request.validateUsing(accessPointParamValidator, {
        data: { params: request.params() },
      })
      const accessPoint = await resolveScopedAccessPoint(ctx, params.accessPointId)
      const service = new UploadProgressService()
      const progress = await service.reset(
        accessPoint.accessPointId,
        accessPoint.businessUnitId,
        auth.user!.userId,
        DateTime.utc()
      )
      return StandardResponseFormatter.success(
        response,
        progress,
        i18n.formatMessage('access_point_upload_progress_title'),
        i18n.formatMessage('access_point_upload_progress_reset_message'),
        200,
        'uploadProgress'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}

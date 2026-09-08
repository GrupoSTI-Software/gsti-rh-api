import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import { ensureAccessPointPermission } from '#modules/access-point/access_point_authorization'
import { ADMS_SERIAL_PATTERN } from '#modules/adms/adms.constants'
import QuarantineClaimService from './quarantine_claim.service.js'

const claimValidator = vine.compile(
  vine.object({
    serialNumber: vine.string().trim().regex(ADMS_SERIAL_PATTERN),
    businessUnitId: vine.number().positive(),
    accessPointName: vine.string().trim().minLength(3).maxLength(150),
  })
)

/**
 * Checadores que aparecieron solos y esperan dueño (spec ADMS 9.3).
 *
 * El canal nunca da de alta un aparato. Reclamarlo es afirmar que es tuyo, y
 * eso se prueba tecleando la serie completa, que solo tiene quien lo ve.
 */
export default class QuarantineController {
  /**
   * @swagger
   * /api/v1/access-points/quarantine:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Equipos en cuarentena, con la serie enmascarada
   *     responses:
   *       200:
   *         description: Lista en data.quarantinedDevices
   */
  async index(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.claimDevice)
      const service = new QuarantineClaimService()
      const rows = await service.list()

      return StandardResponseFormatter.success(
        response,
        rows,
        i18n.formatMessage('access_point_quarantine_title'),
        i18n.formatMessage('access_point_quarantine_list_message'),
        200,
        'quarantinedDevices'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/access-points/quarantine/claim:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Reclama un equipo en cuarentena tecleando su serie completa
   *     responses:
   *       200:
   *         description: Punto de acceso en data.accessPoint
   *       404:
   *         description: No hay un equipo en espera con esa serie
   *       409:
   *         description: Esa serie ya esta registrada (key serie-ya-registrada)
   */
  async claim(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.claimDevice)
      const payload = await request.validateUsing(claimValidator, {
        data: {
          serialNumber: request.input('serialNumber'),
          businessUnitId: request.input('businessUnitId'),
          accessPointName: request.input('accessPointName'),
        },
      })

      const service = new QuarantineClaimService()
      const accessPoint = await service.claim({
        serialNumber: payload.serialNumber,
        businessUnitId: payload.businessUnitId,
        accessPointName: payload.accessPointName,
        businessUnitIds: ctx.businessUnitScope ?? [],
        userId: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        {
          accessPointId: accessPoint.accessPointId,
          name: accessPoint.accessPointName,
          serialNumber: accessPoint.accessPointSerialNumber,
          businessUnitId: accessPoint.businessUnitId,
        },
        i18n.formatMessage('access_point_quarantine_title'),
        i18n.formatMessage('access_point_quarantine_claimed_message'),
        200,
        'accessPoint'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}

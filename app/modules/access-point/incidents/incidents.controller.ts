import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import { ensureAccessPointPermission } from '#modules/access-point/access_point_authorization'
import { ADMS_INCIDENT_KIND, type AdmsIncidentKind } from '#modules/adms/adms.constants'
import IncidentsService from './incidents.service.js'
import { toIncidentDto } from './incidents.dto.js'

const INCIDENT_KINDS = Object.values(ADMS_INCIDENT_KIND)
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

const listValidator = vine.compile(
  vine.object({
    status: vine.enum(['open', 'resolved'] as const).optional(),
    kind: vine.string().trim().optional(),
    accessPointId: vine.number().positive().optional(),
    limit: vine.number().min(1).max(MAX_LIMIT).optional(),
  })
)

const resolveValidator = vine.compile(
  vine.object({ params: vine.object({ incidentId: vine.number().positive() }) })
)

/** Incidentes del canal (spec ADMS 11). Solo los que tienen empresa. */
export default class IncidentsController {
  /**
   * @swagger
   * /api/v1/access-points/incidents:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Incidentes del canal de la empresa
   *     responses:
   *       200:
   *         description: Lista en data.incidents
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth)
      const payload = await request.validateUsing(listValidator, {
        data: {
          status: request.input('status'),
          kind: request.input('kind'),
          accessPointId: request.input('accessPointId'),
          limit: request.input('limit'),
        },
      })

      /**
       * El tipo se valida contra el catalogo en vez de confiarlo al `where`:
       * una cadena libre en la consulta es una via de sondeo del esquema.
       */
      const kind =
        payload.kind !== undefined && INCIDENT_KINDS.includes(payload.kind as AdmsIncidentKind)
          ? (payload.kind as AdmsIncidentKind)
          : undefined

      const service = new IncidentsService()
      const rows = await service.list({
        businessUnitIds: ctx.businessUnitScope ?? [],
        status: payload.status,
        kind,
        accessPointId: payload.accessPointId,
        limit: payload.limit ?? DEFAULT_LIMIT,
      })

      return StandardResponseFormatter.success(
        response,
        rows.map(toIncidentDto),
        i18n.formatMessage('access_point_incident_title'),
        i18n.formatMessage('access_point_incident_list_message'),
        200,
        'incidents'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/access-points/incidents/{incidentId}/resolve:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Puntos de acceso]
   *     summary: Marca el incidente como atendido
   *     responses:
   *       200:
   *         description: Incidente en data.incident
   *       404:
   *         description: El incidente no esta en el alcance
   */
  async resolve(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(ctx, ACCESS_POINT_PERMISSION_DECLARATIONS.manageCommands)
      const { params } = await request.validateUsing(resolveValidator, {
        data: { params: request.params() },
      })

      const service = new IncidentsService()
      const incident = await service.resolve({
        incidentId: params.incidentId,
        businessUnitIds: ctx.businessUnitScope ?? [],
        userId: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        toIncidentDto(incident),
        i18n.formatMessage('access_point_incident_title'),
        i18n.formatMessage('access_point_incident_resolved_message'),
        200,
        'incident'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}

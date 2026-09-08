import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import AccessPoint from '#models/access_point'
import AdmsIncident from '#models/adms_incident'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import { TenantContext } from '#utils/tenant_context'
import HealthService from '#modules/access-point/health/health.service'
import { toIncidentDto } from '#modules/access-point/incidents/incidents.dto.js'

const idValidator = vine.compile(
  vine.object({ params: vine.object({ quarantinedDeviceId: vine.number().positive() }) })
)

const dismissValidator = vine.compile(
  vine.object({
    params: vine.object({ quarantinedDeviceId: vine.number().positive() }),
    reason: vine.string().trim().minLength(3).maxLength(200),
  })
)

const UNSCOPED_REASON =
  'plataforma: la vista global de equipos cruza todas las empresas por definicion'

/**
 * Vista de plataforma sobre la flota (spec ADMS 11).
 *
 * Es el unico sitio donde se cruzan empresas, y por eso vive detras de
 * `platformAdmin` y no de un permiso de modulo: lo que se ve aqui -- series
 * completas, incidentes sin dueño, equipos de todos -- no lo puede ver el
 * administrador de una empresa por muchos permisos que tenga.
 */
export default class PlatformDevicesController {
  /**
   * @swagger
   * /api/platform/devices/health:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Plataforma]
   *     summary: Estado de los checadores de todas las empresas
   *     responses:
   *       200:
   *         description: Lista en data.accessPoints
   */
  async health(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      const now = DateTime.utc()
      const rows = await TenantContext.runUnscoped(async () => {
        const accessPoints = await AccessPoint.query().orderBy('business_unit_id', 'asc').limit(500)
        const service = new HealthService()
        const health = []
        for (const accessPoint of accessPoints) {
          health.push({
            businessUnitId: accessPoint.businessUnitId,
            ...(await service.buildFor(accessPoint, now)),
          })
        }
        return health
      }, UNSCOPED_REASON)

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
   * /api/platform/devices/quarantine:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Plataforma]
   *     summary: Equipos en cuarentena con la serie completa
   *     responses:
   *       200:
   *         description: Lista en data.quarantinedDevices
   */
  async quarantine(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      /** Aqui SI va la serie completa: plataforma es quien resuelve los casos raros. */
      const rows = await TenantContext.runUnscoped(
        () =>
          AdmsQuarantinedDevice.query()
            .orderBy('adms_quarantined_device_last_seen_at', 'desc')
            .limit(300),
        UNSCOPED_REASON
      )

      return StandardResponseFormatter.success(
        response,
        rows.map((row) => ({
          quarantinedDeviceId: row.admsQuarantinedDeviceId,
          serial: row.admsQuarantinedDeviceSerial,
          status: row.admsQuarantinedDeviceStatus,
          hitCount: row.admsQuarantinedDeviceHitCount,
          failedClaims: row.admsQuarantinedDeviceFailedClaims,
          lastIp: row.admsQuarantinedDeviceLastIp,
          hints: row.admsQuarantinedDeviceHints,
          claimedBusinessUnitId: row.claimedBusinessUnitId,
          firstSeenAt: row.admsQuarantinedDeviceFirstSeenAt.toISO(),
          lastSeenAt: row.admsQuarantinedDeviceLastSeenAt.toISO(),
        })),
        i18n.formatMessage('access_point_quarantine_title'),
        i18n.formatMessage('access_point_quarantine_list_message'),
        200,
        'quarantinedDevices'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /** Descarta una fila: un aparato que no es de nadie o que fue una sonda. */
  async dismiss(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      const payload = await request.validateUsing(dismissValidator, {
        data: { params: request.params(), reason: request.input('reason') },
      })
      const row = await this.requireRow(payload.params.quarantinedDeviceId)

      row.admsQuarantinedDeviceStatus = 'dismissed'
      row.admsQuarantinedDeviceDismissReason = payload.reason
      row.admsQuarantinedDeviceResolvedByUserId = auth.user?.userId ?? null
      row.admsQuarantinedDeviceResolvedAt = DateTime.utc()
      await TenantContext.runUnscoped(() => row.save(), UNSCOPED_REASON)

      return StandardResponseFormatter.success(
        response,
        { quarantinedDeviceId: row.admsQuarantinedDeviceId, status: row.admsQuarantinedDeviceStatus },
        i18n.formatMessage('access_point_quarantine_title'),
        i18n.formatMessage('platform_quarantine_dismissed_message'),
        200,
        'quarantinedDevice'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * Libera una fila bloqueada por intentos fallidos.
   *
   * El bloqueo lo pone el sistema para que probar series no sea gratis; quitarlo
   * es una decision de plataforma y por eso reinicia el contador: dejarlo en el
   * limite haria que el siguiente error volviera a bloquear.
   */
  async unlock(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      const { params } = await request.validateUsing(idValidator, {
        data: { params: request.params() },
      })
      const row = await this.requireRow(params.quarantinedDeviceId)

      row.admsQuarantinedDeviceStatus = 'pending'
      row.admsQuarantinedDeviceFailedClaims = 0
      row.admsQuarantinedDeviceResolvedByUserId = auth.user?.userId ?? null
      await TenantContext.runUnscoped(() => row.save(), UNSCOPED_REASON)

      return StandardResponseFormatter.success(
        response,
        { quarantinedDeviceId: row.admsQuarantinedDeviceId, status: row.admsQuarantinedDeviceStatus },
        i18n.formatMessage('access_point_quarantine_title'),
        i18n.formatMessage('platform_quarantine_unlocked_message'),
        200,
        'quarantinedDevice'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * Incidentes de todas las empresas, INCLUIDOS los globales.
   *
   * Los globales -- una serie desconocida sondeando, una IP enumerando -- no
   * cuelgan de ningun tenant y solo se ven aqui.
   */
  async incidents(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      const status = request.input('status')
      const rows = await TenantContext.runUnscoped(
        () =>
          AdmsIncident.query()
            .if(typeof status === 'string' && status.length > 0, (query) =>
              query.where('adms_incident_status', status as string)
            )
            .orderBy('adms_incident_id', 'desc')
            .limit(300),
        UNSCOPED_REASON
      )

      return StandardResponseFormatter.success(
        response,
        rows.map((row) => ({ businessUnitId: row.businessUnitId, ...toIncidentDto(row) })),
        i18n.formatMessage('access_point_incident_title'),
        i18n.formatMessage('access_point_incident_list_message'),
        200,
        'incidents'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /** Plazos con los que corre la purga, para verlos sin entrar al servidor. */
  async retention(ctx: HttpContext) {
    const { response, i18n } = ctx
    try {
      const { admsRetentionSummary } = await import('#modules/adms/retention/retention.constants')
      const counts = await TenantContext.runUnscoped(async () => {
        const raw = await db.from('adms_raw_messages').count('* as total')
        const commands = await db.from('device_commands').count('* as total')
        return {
          rawMessages: Number(raw[0].total ?? 0),
          commands: Number(commands[0].total ?? 0),
        }
      }, UNSCOPED_REASON)

      return StandardResponseFormatter.success(
        response,
        { retentionDays: admsRetentionSummary(), counts },
        i18n.formatMessage('access_point_health_title'),
        i18n.formatMessage('platform_retention_message'),
        200,
        'retention'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  private async requireRow(quarantinedDeviceId: number): Promise<AdmsQuarantinedDevice> {
    const row = await TenantContext.runUnscoped(
      () =>
        AdmsQuarantinedDevice.query()
          .where('adms_quarantined_device_id', quarantinedDeviceId)
          .first(),
      UNSCOPED_REASON
    )
    if (row) return row
    const { AdmsError } = await import('#exceptions/adms_error')
    const { ADMS_ERROR_CODES } = await import('#constants/adms_error_codes')
    throw new AdmsError(
      'No se encontro esa fila de cuarentena',
      ADMS_ERROR_CODES.QUAR_NOT_FOUND,
      404,
      'cuarentena-no-encontrada'
    )
  }
}

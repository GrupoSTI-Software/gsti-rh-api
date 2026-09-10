import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import { TenantContext } from '#utils/tenant_context'
import AccessPointProfile from '#models/access_point_profile'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import BiometricTemplate from '#models/biometric_template'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'
import AdmsIncident from '#models/adms_incident'
import DeviceCommand from '#models/device_command'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import {
  DEVICE_COMMAND_STALE_PENDING_MINUTES,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import UploadProgressRepositoryMysql from '#modules/access-point/upload-progress/upload_progress.repository.mysql'
import type { UploadProgressRepository } from '#modules/access-point/upload-progress/upload_progress.repository'
import {
  ADMS_CAPACITY_SOURCE,
  ADMS_HEALTH_OFFLINE_THRESHOLD_SECONDS,
  ADMS_HEALTH_STATUS,
  type AdmsHealthStatus,
} from './health.constants.js'
import type {
  AccessPointHealthDto,
  DeviceModelDto,
  EnrollmentHealth,
  IncidentsHealth,
  OccupancySlot,
  QueueHealth,
} from './health.dto.js'

/** Estados del pivote en los que el equipo todavia no confirmo el movimiento. */
const UNCONFIRMED_SYNC_STATUSES = [
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.SENT,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.FAILED,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_SENT,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED,
]

/** El catalogo de modelos es de plataforma, no de una empresa. */
const MODEL_UNSCOPED_REASON =
  'salud del checador: el catalogo de modelos es de plataforma, no de una empresa'

/**
 * Estado de los checadores para la pantalla de operacion (spec ADMS 9.2).
 *
 * Un equipo caido son checadas que nadie esta registrando, y enterarse tarde es
 * enterarse cuando ya hay que reconstruir la nomina a mano. Por eso el umbral
 * de "caido" es de un minuto: el aparato sondea cada pocos segundos.
 *
 * Todo lo que se muestra viene del equipo o de la cola. Nada se infiere por
 * modelo: una capacidad inventada haria que alguien planeara altas que no caben.
 */
export default class HealthService {
  constructor(
    private readonly progress: UploadProgressRepository = new UploadProgressRepositoryMysql()
  ) {}

  /** Salud de todos los equipos del alcance. */
  async listFor(businessUnitIds: number[], now: DateTime): Promise<AccessPointHealthDto[]> {
    if (businessUnitIds.length === 0) return []
    const accessPoints = await AccessPoint.query()
      .whereIn('business_unit_id', businessUnitIds)
      .orderBy('access_point_name', 'asc')

    const rows: AccessPointHealthDto[] = []
    for (const accessPoint of accessPoints) {
      rows.push(await this.buildFor(accessPoint, now))
    }
    return rows
  }

  async buildFor(accessPoint: AccessPoint, now: DateTime): Promise<AccessPointHealthDto> {
    const profile = await AccessPointProfile.query()
      .where('access_point_id', accessPoint.accessPointId)
      .first()
    const stamps = await this.progress.listFor(accessPoint.accessPointId)
    const queue = await this.queueOf(accessPoint, now)
    const openIncidents = await this.openIncidentsOf(accessPoint.accessPointId)
    const enrollment = await this.enrollmentOf(accessPoint.accessPointId)
    const ipAnomalyOpen = await this.hasOpenIpAnomaly(accessPoint.accessPointId)

    const lastUploadAt: Record<string, string | null> = {}
    for (const stamp of stamps) {
      lastUploadAt[stamp.table] = stamp.lastUploadAt?.toISO() ?? null
    }

    return {
      accessPointId: accessPoint.accessPointId,
      name: accessPoint.accessPointName,
      serialNumber: accessPoint.accessPointSerialNumber,
      deviceName: accessPoint.accessPointDeviceName ?? null,
      mac: accessPoint.accessPointMac ?? null,
      ip: accessPoint.accessPointIp ?? null,
      model: await this.modelOf(accessPoint),
      active: accessPoint.accessPointActive === 1,
      status: statusOf(accessPoint.accessPointLastConnection, now),
      lastSeenAt: accessPoint.accessPointLastConnection?.toISO() ?? null,
      lastUploadAt,
      firmware: profile?.accessPointProfileFwVersion ?? null,
      platform: profile?.accessPointProfilePlatform ?? null,
      pushVersion: profile?.accessPointProfilePushVersion ?? null,
      dialect: profile?.accessPointProfileDialect ?? null,
      layoutKnown: profile?.accessPointProfileLayoutKnown === 1,
      versions: {
        fingerprint: profile?.accessPointProfileFpVersion ?? null,
        face: profile?.accessPointProfileFaceVersion ?? null,
        fingerVein: profile?.accessPointProfileFvVersion ?? null,
        palm: profile?.accessPointProfilePvVersion ?? null,
      },
      clock: {
        offsetSeconds: profile?.accessPointProfileClockOffsetSeconds ?? null,
        measuredAt: profile?.accessPointProfileClockMeasuredAt?.toISO() ?? null,
        syncedAt: profile?.accessPointProfileClockSyncedAt?.toISO() ?? null,
        status: profile?.accessPointProfileClockSyncStatus ?? null,
      },
      occupancy: occupancyOf(profile),
      enrollment,
      queue,
      openIncidents,
      hardening: {
        cidrRestricted: (accessPoint.accessPointAllowedCidrs ?? []).length > 0,
        lastIpSeen: profile?.accessPointProfileLastIpSeen ?? null,
        lastIpSeenAt: profile?.accessPointProfileLastIpSeenAt?.toISO() ?? null,
        ipAnomalyOpen,
      },
    }
  }

  /**
   * Padron propio del equipo.
   *
   * El firmware responde a INFO con sus maximos y nunca con conteos actuales, y
   * el servidor no puede consultarlo: lo unico que se puede afirmar es lo que
   * Valanserh tiene registrado, que ademas es lo accionable — un PIN suelto se
   * vincula y un alta sin confirmar se reintenta.
   */
  private async enrollmentOf(accessPointId: number): Promise<EnrollmentHealth> {
    const confirmed = await AccessPointEmployee.query()
      .where('access_point_id', accessPointId)
      .where(
        'access_point_employee_sync_status',
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
      )
      .count('* as total')
      .first()

    const unconfirmed = await AccessPointEmployee.query()
      .where('access_point_id', accessPointId)
      .whereIn('access_point_employee_sync_status', UNCONFIRMED_SYNC_STATUSES)
      .count('* as total')
      .first()

    const unmapped = await AdmsUnmappedPin.query()
      .where('access_point_id', accessPointId)
      .where('adms_unmapped_pin_status', 'pending')
      .count('* as total')
      .first()

    const templates = await BiometricTemplate.query()
      .where('source_access_point_id', accessPointId)
      .select('biometric_template_bio_type')
      .count('* as total')
      .groupBy('biometric_template_bio_type')

    const byType = new Map<number, number>()
    for (const row of templates) {
      byType.set(Number(row.biometricTemplateBioType), Number(row.$extras.total))
    }

    return {
      confirmedEmployees: Number(confirmed?.$extras.total ?? 0),
      pendingEmployees: Number(unconfirmed?.$extras.total ?? 0),
      unmappedPins: Number(unmapped?.$extras.total ?? 0),
      fingerprints: byType.get(BIO_TYPE.FINGERPRINT) ?? 0,
      faces: byType.get(BIO_TYPE.FACE) ?? 0,
      palms: byType.get(BIO_TYPE.PALM) ?? 0,
    }
  }

  /**
   * Un pendiente es `stale` cuando el equipo lleva rato sin dar señales: la
   * orden no esta atorada por culpa de la cola, sino porque nadie la recoge.
   */
  private async queueOf(accessPoint: AccessPoint, now: DateTime): Promise<QueueHealth> {
    const counts = await DeviceCommand.query()
      .where('access_point_id', accessPoint.accessPointId)
      .whereIn('device_command_status', [
        DEVICE_COMMAND_STATUS.PENDING,
        DEVICE_COMMAND_STATUS.SENT,
        DEVICE_COMMAND_STATUS.FAILED,
      ])
      .select('device_command_status')
      .count('* as total')
      .groupBy('device_command_status')

    const byStatus = new Map<string, number>()
    for (const row of counts) {
      byStatus.set(String(row.deviceCommandStatus), Number(row.$extras.total))
    }

    const oldest = await DeviceCommand.query()
      .where('access_point_id', accessPoint.accessPointId)
      .where('device_command_status', DEVICE_COMMAND_STATUS.PENDING)
      .orderBy('device_command_id', 'asc')
      .first()

    const pending = byStatus.get(DEVICE_COMMAND_STATUS.PENDING) ?? 0
    const lastSeen = accessPoint.accessPointLastConnection
    const staleSince = now.minus({ minutes: DEVICE_COMMAND_STALE_PENDING_MINUTES })
    const deviceIsQuiet = lastSeen === null || lastSeen < staleSince

    return {
      pending,
      inFlight: byStatus.get(DEVICE_COMMAND_STATUS.SENT) ?? 0,
      failed: byStatus.get(DEVICE_COMMAND_STATUS.FAILED) ?? 0,
      stale: deviceIsQuiet ? pending : 0,
      oldestPendingSeconds:
        oldest?.deviceCommandCreatedAt !== undefined && oldest.deviceCommandCreatedAt !== null
          ? Math.max(0, Math.round(now.diff(oldest.deviceCommandCreatedAt, 'seconds').seconds))
          : null,
    }
  }

  /**
   * Modelo del catalogo, solo si la unidad entro por el inventario de
   * plataforma. Un equipo dado de alta a mano no lo tiene, y ahi el Backoffice
   * cae a la imagen generica en vez de mostrar una que no corresponde.
   */
  private async modelOf(accessPoint: AccessPoint): Promise<DeviceModelDto | null> {
    if (!accessPoint.platformDeviceId) return null
    const row = await TenantContext.runUnscoped(
      () =>
        db
          .from('platform_devices as d')
          .innerJoin('platform_device_models as m', 'm.platform_device_model_id', 'd.platform_device_model_id')
          .where('d.platform_device_id', accessPoint.platformDeviceId as number)
          .select(
            'm.platform_device_model_id',
            'm.platform_device_model_brand',
            'm.platform_device_model_name',
            'm.platform_device_model_slug'
          )
          .first(),
      MODEL_UNSCOPED_REASON
    )
    if (!row) return null
    return {
      platformDeviceModelId: Number(row.platform_device_model_id),
      brand: String(row.platform_device_model_brand),
      name: String(row.platform_device_model_name),
      slug: String(row.platform_device_model_slug),
    }
  }

  /**
   * Avisos abiertos separados por severidad.
   *
   * Se cuentan aparte porque no piden lo mismo: el `warning` de un reloj
   * corrido hay que atenderlo, y el `info` de una bitacora subida solo deja
   * constancia. Mezclarlos hace que el indicador marque siempre algo.
   */
  private async openIncidentsOf(accessPointId: number): Promise<IncidentsHealth> {
    const rows = await AdmsIncident.query()
      .where('access_point_id', accessPointId)
      .whereNull('adms_incident_resolved_at')
      .select('adms_incident_severity')
      .count('* as total')
      .groupBy('adms_incident_severity')

    let actionable = 0
    let informational = 0
    for (const row of rows) {
      const total = Number(row.$extras.total ?? 0)
      if (row.admsIncidentSeverity === 'info') {
        informational += total
        continue
      }
      actionable += total
    }
    return { actionable, informational }
  }

  private async hasOpenIpAnomaly(accessPointId: number): Promise<boolean> {
    const row = await db
      .from('adms_incidents')
      .where('access_point_id', accessPointId)
      .where('adms_incident_kind', ADMS_INCIDENT_KIND.IP_ANOMALY)
      .whereNull('adms_incident_resolved_at')
      .first()
    return row !== null && row !== undefined
  }
}

/** Un equipo que nunca llamo no esta "caido": casi siempre es red o alta mal hecha. */
export function statusOf(lastSeen: DateTime | null, now: DateTime): AdmsHealthStatus {
  if (lastSeen === null) return ADMS_HEALTH_STATUS.NEVER
  const seconds = now.diff(lastSeen, 'seconds').seconds
  return seconds <= ADMS_HEALTH_OFFLINE_THRESHOLD_SECONDS
    ? ADMS_HEALTH_STATUS.ONLINE
    : ADMS_HEALTH_STATUS.OFFLINE
}

export function occupancyOf(profile: AccessPointProfile | null): OccupancySlot[] {
  const slot = (
    modality: OccupancySlot['modality'],
    count: number | null | undefined,
    capacity: number | null | undefined
  ): OccupancySlot => {
    const usable = count ?? null
    const limit = capacity ?? null
    return {
      modality,
      count: usable,
      capacity: limit,
      capacitySource: limit === null ? ADMS_CAPACITY_SOURCE.UNKNOWN : ADMS_CAPACITY_SOURCE.DECLARED,
      ratio: usable !== null && limit !== null && limit > 0 ? usable / limit : null,
    }
  }

  return [
    slot('users', profile?.accessPointProfileUserCount, profile?.accessPointProfileMaxUserCount),
    slot('fingerprints', profile?.accessPointProfileFpCount, profile?.accessPointProfileMaxFingerCount),
    slot('faces', profile?.accessPointProfileFaceCount, profile?.accessPointProfileMaxFaceCount),
    slot(
      'transactions',
      profile?.accessPointProfileTransactionCount,
      profile?.accessPointProfileMaxAttLogCount
    ),
  ]
}

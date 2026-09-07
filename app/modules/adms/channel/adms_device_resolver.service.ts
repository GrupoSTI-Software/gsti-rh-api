import type { DateTime } from 'luxon'
import type { AdmsQuarantineHints } from '#models/adms_quarantined_device'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { TenantContext } from '#utils/tenant_context'
import {
  ADMS_INCIDENT_KIND,
  ADMS_IP_ANOMALY_WINDOW_SECONDS,
  ADMS_OK,
  ADMS_UNKNOWN_SERIAL_UNSCOPED_REASON,
  isValidDeviceSerial,
} from '#modules/adms/adms.constants'
import IncidentService from '#modules/adms/raw/incident.service'
import QuarantineService from '#modules/access-point/quarantine/quarantine.service'
import DeviceProfileRepositoryMysql from '#modules/access-point/device-profile/device_profile.repository.mysql'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import { ipMatchesCidrList } from './cidr.js'
import {
  AccessPointLookupMysql,
  UnknownSerialThrottleMemory,
  type AccessPointLookupPort,
  type UnknownSerialThrottle,
} from './access_point_lookup.js'

export interface ResolvedAdmsDevice {
  accessPointId: number
  businessUnitId: number
  serial: string
  ip: string
  timezone: string | null
  receivedAt: DateTime
}

export type DeviceResolution =
  | { kind: 'ok'; device: ResolvedAdmsDevice }
  | { kind: 'reject'; status: number; body: string }

const REJECT_OK: DeviceResolution = { kind: 'reject', status: 200, body: ADMS_OK }
const REJECT_TOO_MANY: DeviceResolution = {
  kind: 'reject',
  status: 429,
  body: 'TOO MANY REQUESTS',
}
const INACTIVE_DEDUPE_MINUTES = 60
const IP_ANOMALY_DEDUPE_MINUTES = 24 * 60

/**
 * Serie a empresa (spec v2, 4.2). `resolve` corre FUERA del scope de tenant y
 * solo lee `access_points` por query builder; `touch` corre DENTRO de
 * `TenantContext.run([bu])` y hace las escrituras de contacto (latido, reclamo
 * de cuarentena, anomalia de IP).
 */
export default class AdmsDeviceResolverService {
  constructor(
    private readonly lookup: AccessPointLookupPort = new AccessPointLookupMysql(),
    private readonly throttle: UnknownSerialThrottle = new UnknownSerialThrottleMemory(),
    private readonly incidents: IncidentService = new IncidentService(),
    private readonly quarantine: QuarantineService = new QuarantineService(),
    private readonly profiles: DeviceProfileRepository = new DeviceProfileRepositoryMysql()
  ) {}

  async resolve(input: {
    serial: unknown
    ip: string
    now: DateTime
    hints: AdmsQuarantineHints | null
  }): Promise<DeviceResolution> {
    if (!isValidDeviceSerial(input.serial)) return REJECT_OK
    const serial = input.serial

    const row = await this.lookup.findBySerial(serial)

    if (!row) {
      if (await this.throttle.isBlocked(input.ip)) return REJECT_TOO_MANY
      await TenantContext.runUnscoped(async () => {
        const outcome = await this.quarantine.recordHit({
          serial,
          ip: input.ip,
          hints: input.hints,
          now: input.now,
        })
        if (outcome !== 'created') return
        const threshold = await this.throttle.countNewSerial(input.ip)
        if (threshold === 'threshold_reached') {
          await this.incidents.record({
            kind: ADMS_INCIDENT_KIND.SERIAL_PROBE,
            severity: 'warning',
            code: ADMS_ERROR_CODES.DEV_SERIAL_UNKNOWN,
            title: 'Sondeo de series desde una IP',
            detail:
              'Una misma IP presento demasiadas series desconocidas en una hora; queda bloqueada temporalmente para series no registradas.',
            key: 'sondeo-de-series',
            serial: null,
            accessPointId: null,
            businessUnitId: null,
            context: { ip: input.ip },
            now: input.now,
          })
        }
      }, ADMS_UNKNOWN_SERIAL_UNSCOPED_REASON)
      return REJECT_OK
    }

    if (!row.active) {
      await TenantContext.run([row.businessUnitId], () =>
        this.incidents.record(
          {
            kind: ADMS_INCIDENT_KIND.DEVICE_INACTIVE,
            severity: 'warning',
            code: ADMS_ERROR_CODES.DEV_INACTIVE,
            title: 'Checador desactivado sigue contactando',
            detail:
              'El equipo esta marcado como inactivo; se le responde sin opciones y no recibe comandos.',
            key: 'checador-desactivado',
            serial,
            accessPointId: row.accessPointId,
            businessUnitId: row.businessUnitId,
            context: { ip: input.ip },
            now: input.now,
          },
          { dedupeMinutes: INACTIVE_DEDUPE_MINUTES }
        )
      )
      return REJECT_OK
    }

    if (
      row.allowedCidrs &&
      row.allowedCidrs.length > 0 &&
      !ipMatchesCidrList(input.ip, row.allowedCidrs)
    ) {
      await TenantContext.run([row.businessUnitId], () =>
        this.incidents.record(
          {
            kind: ADMS_INCIDENT_KIND.IP_DENIED,
            severity: 'error',
            code: ADMS_ERROR_CODES.DEV_IP_DENIED,
            title: 'Contacto desde una IP no permitida',
            detail:
              'La serie es valida pero la IP de origen no cae en los CIDR configurados para el punto de acceso.',
            key: 'ip-no-permitida',
            serial,
            accessPointId: row.accessPointId,
            businessUnitId: row.businessUnitId,
            context: { ip: input.ip },
            now: input.now,
          },
          { dedupeMinutes: INACTIVE_DEDUPE_MINUTES }
        )
      )
      return REJECT_OK
    }

    return {
      kind: 'ok',
      device: {
        accessPointId: row.accessPointId,
        businessUnitId: row.businessUnitId,
        serial,
        ip: input.ip,
        timezone: row.timezone,
        receivedAt: input.now,
      },
    }
  }

  /** Escrituras de contacto. Debe correr dentro de `TenantContext.run([businessUnitId])`. */
  async touch(device: ResolvedAdmsDevice): Promise<void> {
    await this.lookup.touchConnection(device.accessPointId, device.ip, device.receivedAt)
    await this.quarantine.claimOnContact(
      device.serial,
      device.accessPointId,
      device.businessUnitId,
      device.receivedAt
    )

    const profile = await this.profiles.ensure(device.accessPointId, device.businessUnitId)
    /**
     * Un perfil recien creado por `ensure` trae estas columnas como `undefined`
     * (Lucid no rellena nullables no asignadas tras `save`): se normalizan a null.
     */
    const previousIp = profile.accessPointProfileLastIpSeen ?? null
    const previousAt = profile.accessPointProfileLastIpSeenAt ?? null
    const withinWindow =
      previousAt !== null &&
      device.receivedAt.diff(previousAt, 'seconds').seconds <= ADMS_IP_ANOMALY_WINDOW_SECONDS
    if (previousIp !== null && previousIp !== device.ip && withinWindow) {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.IP_ANOMALY,
          severity: 'warning',
          code: ADMS_ERROR_CODES.DEV_SERIAL_UNKNOWN,
          title: 'Misma serie desde dos IP en pocos minutos',
          detail:
            'Dos direcciones distintas presentaron la misma serie dentro de la ventana de anomalia. No se bloquea la ingesta; los comandos con template o foto se retienen mientras el incidente siga abierto.',
          key: 'anomalia-de-ip',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          context: { ip: device.ip, previousIp, at: previousAt.toISO() ?? undefined },
          now: device.receivedAt,
        },
        { dedupeMinutes: IP_ANOMALY_DEDUPE_MINUTES }
      )
    }
    profile.accessPointProfileLastIpSeen = device.ip
    profile.accessPointProfileLastIpSeenAt = device.receivedAt
    await profile.save()
  }
}

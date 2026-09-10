import { DateTime } from 'luxon'
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
import env from '#start/env'
import { ipMatchesCidrList } from './cidr.js'
import { channelSecretMatches, hostLabelOf } from './channel_secret.js'
import {
  AccessPointLookupMysql,
  UnknownSerialThrottleMemory,
  type AccessPointLookupPort,
  type AccessPointLookupRow,
  type UnknownSerialThrottle,
} from './access_point_lookup.js'

export interface ResolvedAdmsDevice {
  accessPointId: number
  businessUnitId: number
  serial: string
  ip: string
  timezone: string | null
  receivedAt: DateTime
  /** Ultima vez que alguien configuro la direccion de este equipo. */
  configuredAt: DateTime | null
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
/** Cada cuanto se repite el aviso de direccion que no corresponde. */
const CHANNEL_SECRET_DEDUPE_MINUTES = 60
/** El aviso de "te falta migrar" con una vez al dia basta. */
const SECRET_MISSING_DEDUPE_MINUTES = 24 * 60
const REJECT_NOT_FOUND: DeviceResolution = {
  kind: 'reject',
  status: 404,
  body: 'NOT FOUND',
}
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
    /** `Host` de la peticion: de ahi sale la direccion propia del equipo. */
    host?: string | null
    /** Dominio comun del canal. Sin el, no se exige direccion propia. */
    baseDomain?: string | null
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

    // `null` es "sin restriccion"; una lista vacia (o ilegible) no autoriza a
    // nadie. La comprobacion no mira la longitud a proposito.
    if (row.allowedCidrs !== null && !ipMatchesCidrList(input.ip, row.allowedCidrs)) {
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

    const direccionAjena = await this.rejectIfWrongAddress(row, serial, input)
    if (direccionAjena !== null) return direccionAjena

    return {
      kind: 'ok',
      device: {
        accessPointId: row.accessPointId,
        businessUnitId: row.businessUnitId,
        serial,
        ip: input.ip,
        timezone: row.timezone,
        receivedAt: input.now,
        configuredAt: row.configuredAt,
      },
    }
  }

  /** Escrituras de contacto. Debe correr dentro de `TenantContext.run([businessUnitId])`. */
  /**
   * La direccion por la que llego tiene que ser la suya (spec autenticidad, 4.3).
   *
   * Devuelve el rechazo cuando no lo es, o `null` para seguir. La serie va
   * impresa en el aparato y las de ZKTeco son secuenciales: sin esto, conocerla
   * bastaba para pedir los comandos en cola, con los templates dentro.
   *
   * Un 404 y no un 403: el 403 confirmaria que la serie existe, que es justo lo
   * que el atacante quiere averiguar.
   */
  private async rejectIfWrongAddress(
    row: AccessPointLookupRow,
    serial: string,
    input: {
      ip: string
      now: DateTime
      host?: string | null
      baseDomain?: string | null
    }
  ): Promise<DeviceResolution | null> {
    const baseDomain = input.baseDomain ?? null
    /** Sin dominio comun configurado no se exige nada: es la convivencia. */
    if (baseDomain === null) return null

    const label = hostLabelOf(input.host ?? null, baseDomain)

    if (row.channelSecret !== null) {
      if (channelSecretMatches(label, row.channelSecret)) return null

      /**
       * Quien prueba direcciones al azar lo hace muchas veces: sin contarlo,
       * "alguien nos esta probando" es indistinguible de un checador al que le
       * reescribieron la direccion.
       */
      if ((await this.throttle.countBadAddress(input.ip)) === 'threshold_reached') {
        await this.incidents.record(
          {
            kind: ADMS_INCIDENT_KIND.CHANNEL_HOST_PROBE,
            severity: 'warning',
            code: ADMS_ERROR_CODES.DEV_CHANNEL_HOST_UNKNOWN,
            title: 'Alguien esta probando direcciones del canal',
            detail:
              'Una misma IP presento varias direcciones que no corresponden a ningun checador. No se atendio ninguna y queda bloqueada un rato.',
            key: 'sondeo-de-direcciones',
            serial: null,
            accessPointId: null,
            businessUnitId: null,
            context: { ip: input.ip },
            now: input.now,
          },
          { dedupeMinutes: CHANNEL_SECRET_DEDUPE_MINUTES }
        )
      }

      await TenantContext.run([row.businessUnitId], () =>
        this.incidents.record(
          {
            kind: ADMS_INCIDENT_KIND.CHANNEL_SECRET_MISMATCH,
            severity: 'error',
            code: ADMS_ERROR_CODES.DEV_CHANNEL_SECRET_MISMATCH,
            title: 'Usaron la serie de un checador desde otra direccion',
            detail:
              'La peticion traia una serie registrada pero no la direccion propia de ese equipo, asi que no se atendio. Si el checador dejo de reportar, revisa que conserve su direccion; si sigue reportando, alguien mas esta usando su serie.',
            key: 'direccion-no-corresponde',
            serial,
            accessPointId: row.accessPointId,
            businessUnitId: row.businessUnitId,
            context: { ip: input.ip },
            now: input.now,
          },
          { dedupeMinutes: CHANNEL_SECRET_DEDUPE_MINUTES }
        )
      )
      return REJECT_NOT_FOUND
    }

    /**
     * Sin secreto asignado: es un equipo que todavia no migro. Antes de la
     * fecha de corte se le atiende y queda el aviso; cortarle de golpe deja a
     * un cliente sin asistencia por un ajuste que nadie le aviso.
     */
    if (this.addressEnforced(input.now)) return REJECT_NOT_FOUND

    await TenantContext.run([row.businessUnitId], () =>
      this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.CHANNEL_SECRET_MISSING,
          severity: 'warning',
          code: ADMS_ERROR_CODES.DEV_CHANNEL_SECRET_MISSING,
          title: 'Este checador todavia no tiene direccion propia',
          detail:
            'Sigue hablando por la direccion comun. Asignale la suya y tecleala en el aparato antes de la fecha de corte, o dejara de reportar.',
          key: 'checador-sin-direccion-propia',
          serial,
          accessPointId: row.accessPointId,
          businessUnitId: row.businessUnitId,
          context: { ip: input.ip },
          now: input.now,
        },
        { dedupeMinutes: SECRET_MISSING_DEDUPE_MINUTES }
      )
    )
    return null
  }

  /**
   * A partir de esta fecha, un equipo sin direccion propia deja de atenderse.
   *
   * Sin valor configurado no se exige: desplegar el codigo no puede tirar el
   * canal de un cliente que aun no migro.
   */
  private addressEnforced(now: DateTime): boolean {
    const raw = env.get('ADMS_CHANNEL_SECRET_ENFORCED_FROM')
    if (!raw) return false
    const from = DateTime.fromISO(String(raw))
    return from.isValid && now >= from
  }

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
    await this.profiles.recordIpSeen(device.accessPointId, device.businessUnitId, {
      ip: device.ip,
      seenAt: device.receivedAt,
    })
  }
}

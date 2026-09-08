import type { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import DeviceClockService from '#modules/access-point/device-clock/device_clock.service'
import DeviceClockSyncService from '#modules/access-point/device-clock/device_clock_sync.service'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import { ADMS_INCIDENT_KIND, ADMS_RAW_STATUS, type AdmsRawStatus } from '#modules/adms/adms.constants'
import type { ResolvedAdmsDevice } from '#modules/adms/channel/adms_device_resolver.service'
import { parseAttlogBody, type AttlogRow } from '#modules/adms/parsers/attlog.parser'
import type { AdmsAttlogLayout } from '#modules/adms/parsers/parser.types'
import IncidentService from '#modules/adms/raw/incident.service'
import AssistIngestionService from '#modules/assist-ingestion/assist_ingestion.service'
import type { AssistIngestionItem } from '#modules/assist-ingestion/dto/assist_ingestion.dto'
import { ADMS_HELD_PUNCH_REASON } from '#models/adms_held_punch'
import DeviceTimeService from './device_time.service.js'
import HeldPunchRepositoryMysql from './held_punch.repository.mysql.js'
import PinResolverService from './pin_resolver.service.js'
import type { HeldPunchRepository } from './held_punch.repository.js'

export interface AttlogIngestionContext {
  device: ResolvedAdmsDevice
  body: string
  rawMessageId: number
  /** Plataforma declarada en `options`; `null` mientras el equipo no la haya subido. */
  layout: AdmsAttlogLayout | null
  /** Nombre legible del punto de acceso, para el alias de la checada. */
  accessPointName: string
  /** Zona del punto de acceso; `null` usa la de la empresa. */
  deviceZone: string | null
  businessUnitZone: string | null
}

export interface AttlogIngestionResult {
  status: AdmsRawStatus
  error: string | null
  inserted: number
  preexisting: number
  held: number
  unparsed: number
}

const UNKNOWN_LAYOUT_DEDUPE_MINUTES = 24 * 60
const PARSE_ERROR_DEDUPE_MINUTES = 60
const TIMEZONE_DEDUPE_MINUTES = 24 * 60

/**
 * Convierte una subida `ATTLOG` en checadas (spec v2, 5).
 *
 * Regla que gobierna todo el metodo: una checada es tiempo trabajado que
 * alguien tiene que cobrar. Nada se descarta. Lo que no se puede atribuir se
 * retiene con su motivo; lo que no se puede leer deja incidente. El acuse al
 * equipo sale igual, porque el cuerpo crudo ya esta guardado y reprocesable.
 */
export default class AttlogIngestionService {
  constructor(
    private readonly pins: PinResolverService = new PinResolverService(),
    private readonly time: DeviceTimeService = new DeviceTimeService(),
    private readonly held: HeldPunchRepository = new HeldPunchRepositoryMysql(),
    private readonly assists: AssistIngestionService = new AssistIngestionService(),
    private readonly incidents: IncidentService = new IncidentService(),
    private readonly clock: DeviceClockService = new DeviceClockService(),
    private readonly clockSync: DeviceClockSyncService = new DeviceClockSyncService()
  ) {}

  async ingest(context: AttlogIngestionContext): Promise<AttlogIngestionResult> {
    const { device } = context
    const parsed = parseAttlogBody(context.body, context.layout)

    if (context.layout === null) {
      await this.recordIncident(context, {
        kind: ADMS_INCIDENT_KIND.UNKNOWN_LAYOUT,
        severity: 'warning',
        code: ADMS_ERROR_CODES.VAL_LAYOUT_UNKNOWN,
        title: 'Disposicion de checadas no validada',
        detail:
          'El equipo no ha declarado una plataforma conocida: se leen solo PIN, hora y metodo de verificacion. El resto de los campos queda sin interpretar.',
        key: 'disposicion-desconocida',
        dedupeMinutes: UNKNOWN_LAYOUT_DEDUPE_MINUTES,
      })
    }

    if (parsed.unparsed.length > 0) {
      await this.recordIncident(context, {
        kind: ADMS_INCIDENT_KIND.PARSE_ERROR,
        severity: 'warning',
        code: ADMS_ERROR_CODES.VAL_LINE_UNPARSEABLE,
        title: 'Lineas de checada ilegibles',
        detail:
          'Una o mas lineas de la subida no tienen la forma esperada; el resto del lote si se proceso y el cuerpo crudo queda para revision.',
        key: 'linea-ilegible',
        dedupeMinutes: PARSE_ERROR_DEDUPE_MINUTES,
        context: { lines: parsed.unparsed.length },
      })
    }

    const zone = this.time.resolveZone(context.deviceZone, context.businessUnitZone)
    if (zone.fellBack) {
      await this.recordIncident(context, {
        kind: ADMS_INCIDENT_KIND.TIMEZONE_INVALID,
        severity: 'error',
        code: ADMS_ERROR_CODES.VAL_TIMEZONE_INVALID,
        title: 'Zona horaria mal configurada',
        detail:
          'La zona configurada para el equipo o la sede no existe; las checadas se convirtieron con la zona del sistema y su hora puede estar corrida.',
        key: 'zona-invalida',
        dedupeMinutes: TIMEZONE_DEDUPE_MINUTES,
      })
    }

    const items: AssistIngestionItem[] = []
    /** Linea que origino cada item, alineada por posicion: el codigo del
     * colaborador no sirve de llave porque puede diferir del PIN. */
    const sourceRows: AttlogRow[] = []
    /**
     * Diferencia entre cuando llego la subida y cuando dice el equipo que
     * ocurrio cada checada. Se juntan todas y se observan UNA vez al final:
     * medir dentro del bucle escribiria el perfil una vez por linea.
     */
    const clockSamples: number[] = []
    let heldCount = 0
    let invalidTime = 0

    for (const row of parsed.rows) {
      const converted = this.time.toUtc(row.localTime, zone.zone)
      if (!converted.ok) {
        invalidTime += 1
        continue
      }

      clockSamples.push(
        Math.round(device.receivedAt.diff(converted.utc, 'seconds').seconds)
      )

      const resolution = await this.pins.resolve({
        accessPointId: device.accessPointId,
        businessUnitId: device.businessUnitId,
        pin: row.pin,
      })

      if (resolution.kind === 'held') {
        await this.holdRow(context, row, converted.utc, zone.zone, resolution.reason)
        heldCount += 1
        continue
      }

      items.push({
        subject: {
          kind: 'employeeCode',
          employeeCode: resolution.employeeCode,
          businessUnitId: device.businessUnitId,
        },
        assistType: null,
        punchTimeUtc: converted.utc,
        geo: { latitude: null, longitude: null, precision: null },
        origin: ASSIST_ORIGIN.ADMS,
        createdByUserId: null,
        terminalSn: device.serial,
        terminalAlias: context.accessPointName,
        verifyMethod: row.verify,
        clientRef: null,
      })
      sourceRows.push(row)
    }

    if (invalidTime > 0) {
      await this.recordIncident(context, {
        kind: ADMS_INCIDENT_KIND.PARSE_ERROR,
        severity: 'warning',
        code: ADMS_ERROR_CODES.VAL_LINE_UNPARSEABLE,
        title: 'Horas de checada no interpretables',
        detail:
          'Una o mas checadas traen una hora que no se pudo convertir con la zona configurada.',
        key: 'hora-ilegible',
        dedupeMinutes: PARSE_ERROR_DEDUPE_MINUTES,
        context: { lines: invalidTime },
      })
    }

    let inserted = 0
    let preexisting = 0

    if (items.length > 0) {
      const result = await this.assists.ingest(items, { deferCalendarRecalc: true })
      inserted = result.summary.inserted
      preexisting = result.summary.preexisting

      /**
       * Un rechazo aqui no deberia ocurrir: el PIN ya resolvio a un
       * colaborador vivo de esta empresa. Si ocurre, la checada se retiene en
       * vez de perderse y el motivo queda visible.
       */
      for (const [index, itemResult] of result.results.entries()) {
        if (itemResult.outcome !== 'rejected') continue
        const source = sourceRows[index]
        if (source === undefined) continue
        heldCount += 1
        await this.holdRow(
          context,
          source,
          items[index].punchTimeUtc,
          zone.zone,
          ADMS_HELD_PUNCH_REASON.INGESTION_REJECTED
        )
      }
    }

    await this.observeClock(context, clockSamples, zone.zone)

    const clean = parsed.unparsed.length === 0 && heldCount === 0 && invalidTime === 0
    return {
      status: clean ? ADMS_RAW_STATUS.PROCESSED : ADMS_RAW_STATUS.PARTIAL,
      error: clean ? null : `held=${heldCount} unparsed=${parsed.unparsed.length + invalidTime}`,
      inserted,
      preexisting,
      held: heldCount,
      unparsed: parsed.unparsed.length + invalidTime,
    }
  }

  /**
   * Observa el reloj con las muestras del lote (spec 6.7).
   *
   * Va al final y una sola vez. Nunca lanza hacia el canal: un problema
   * midiendo el reloj no puede convertir en error una subida de checadas que
   * ya se guardo.
   */
  private async observeClock(
    context: AttlogIngestionContext,
    samples: number[],
    zone: string
  ): Promise<void> {
    if (samples.length === 0) return
    const { device } = context

    try {
      const observation = await this.clock.observe({
        accessPointId: device.accessPointId,
        businessUnitId: device.businessUnitId,
        serial: device.serial,
        samples,
        now: device.receivedAt,
      })

      if (observation.medianSeconds === null) return

      if (!observation.driftDetected && !observation.dstSuspected) {
        // La hora del equipo cuadra: si habia un ajuste esperando, esta es su
        // evidencia. El acuse nunca pudo darla.
        await this.clockSync.confirmFromDrift({
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          now: device.receivedAt,
        })
        return
      }

      /**
       * Con sospecha de cambio de horario no se encola nada: el incidente ya
       * quedo levantado y ajustar la hora taparia el sintoma real, que es la
       * zona mal configurada en el aparato.
       */
      if (observation.dstSuspected) return

      await this.clockSync.request({
        accessPointId: device.accessPointId,
        businessUnitId: device.businessUnitId,
        deviceZone: zone,
        now: device.receivedAt,
      })
    } catch (error) {
      logger.error(
        {
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error),
          accessPointId: device.accessPointId,
        },
        'canal ADMS: fallo la observacion del reloj; la ingesta de checadas no se altera'
      )
    }
  }

  private async holdRow(
    context: AttlogIngestionContext,
    row: AttlogRow,
    punchTimeUtc: DateTime,
    zone: string,
    reason: (typeof ADMS_HELD_PUNCH_REASON)[keyof typeof ADMS_HELD_PUNCH_REASON]
  ): Promise<void> {
    const { device } = context
    if (
      reason === ADMS_HELD_PUNCH_REASON.UNKNOWN_PIN ||
      reason === ADMS_HELD_PUNCH_REASON.AMBIGUOUS_CODE
    ) {
      await this.held.touchUnmappedPin({
        accessPointId: device.accessPointId,
        businessUnitId: device.businessUnitId,
        pin: row.pin,
        now: device.receivedAt,
      })
    }
    await this.held.hold({
      accessPointId: device.accessPointId,
      businessUnitId: device.businessUnitId,
      pin: row.pin,
      punchTimeLocal: punchTimeUtc.setZone(zone),
      punchTimeUtc,
      verify: row.verify,
      rawMessageId: context.rawMessageId,
      reason,
    })
  }

  private async recordIncident(
    context: AttlogIngestionContext,
    input: {
      kind: (typeof ADMS_INCIDENT_KIND)[keyof typeof ADMS_INCIDENT_KIND]
      severity: 'info' | 'warning' | 'error'
      code: string
      title: string
      detail: string
      key: string
      dedupeMinutes: number
      context?: { lines?: number; platform?: string }
    }
  ): Promise<void> {
    await this.incidents.record(
      {
        kind: input.kind,
        severity: input.severity,
        code: input.code,
        title: input.title,
        detail: input.detail,
        key: input.key,
        serial: context.device.serial,
        accessPointId: context.device.accessPointId,
        businessUnitId: context.device.businessUnitId,
        rawMessageId: context.rawMessageId,
        context: input.context ?? null,
        now: context.device.receivedAt,
      },
      { dedupeMinutes: input.dedupeMinutes }
    )
  }
}

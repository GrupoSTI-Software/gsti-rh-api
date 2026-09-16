import type { DateTime } from 'luxon'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import IncidentService from '#modules/adms/raw/incident.service'
import type { AccessPointClockSyncStatus } from '#models/access_point_profile'
import {
  ADMS_CLOCK_DRIFT_THRESHOLD_SECONDS,
  ADMS_CLOCK_DST_OFFSET_SECONDS,
  ADMS_CLOCK_DST_TOLERANCE_SECONDS,
  ADMS_CLOCK_SAMPLE_MAX_ABS_SECONDS,
  ADMS_CLOCK_SAMPLE_WINDOW,
} from './device_clock.constants.js'
import DeviceClockRepositoryMysql from './device_clock.repository.mysql.js'
import type { DeviceClockRepository } from './device_clock.repository.js'

export interface ClockObservationInput {
  accessPointId: number
  businessUnitId: number
  serial: string
  /** Diferencias `receivedAt - punchTimeUtc` en segundos, una por checada del lote. */
  samples: number[]
  now: DateTime
}

export interface ClockObservation {
  medianSeconds: number | null
  driftDetected: boolean
  dstSuspected: boolean
  /** Cuantas muestras del lote se descartaron por venir de checadas viejas. */
  discarded: number
}

const DRIFT_DEDUPE_MINUTES = 24 * 60

/**
 * Mediana de una lista no vacia. Con un numero par de muestras se promedian las
 * dos centrales y se redondea: la deriva se mide en segundos enteros.
 */
export function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/**
 * Reloj del checador (spec ADMS 6.7).
 *
 * Se usa la MEDIANA y no el promedio a proposito: una sola checada que el
 * equipo tenia guardada desde ayer arrastraria el promedio y haria creer que
 * el reloj esta corrido cuando no lo esta.
 */
export default class DeviceClockService {
  constructor(
    private readonly repository: DeviceClockRepository = new DeviceClockRepositoryMysql(),
    private readonly incidents: IncidentService = new IncidentService()
  ) {}

  async observe(input: ClockObservationInput): Promise<ClockObservation> {
    const usable = input.samples.filter(
      (value) => Number.isFinite(value) && Math.abs(value) < ADMS_CLOCK_SAMPLE_MAX_ABS_SECONDS
    )
    const discarded = input.samples.length - usable.length

    if (usable.length === 0) {
      return { medianSeconds: null, driftDetected: false, dstSuspected: false, discarded }
    }

    const state = await this.repository.read(input.accessPointId, input.businessUnitId)
    const window = [...state.samples, ...usable].slice(-ADMS_CLOCK_SAMPLE_WINDOW)
    const median = medianOf(window)

    const driftDetected = Math.abs(median) > ADMS_CLOCK_DRIFT_THRESHOLD_SECONDS
    const dstSuspected =
      Math.abs(Math.abs(median) - ADMS_CLOCK_DST_OFFSET_SECONDS) < ADMS_CLOCK_DST_TOLERANCE_SECONDS

    await this.repository.write(input.accessPointId, input.businessUnitId, {
      samples: window,
      offsetSeconds: median,
      measuredAt: input.now,
    })

    if (dstSuspected) {
      await this.recordIncident(input, {
        kind: ADMS_INCIDENT_KIND.CLOCK_DST_SUSPECTED,
        severity: 'warning',
        title: 'El checador parece no haber aplicado un cambio de horario',
        detail:
          'La deriva es de casi una hora exacta. Ajustar la hora taparia el sintoma: hay que revisar la zona horaria configurada en el equipo.',
        key: 'reloj-horario-de-verano',
        median,
      })
    } else if (driftDetected) {
      await this.recordIncident(input, {
        kind: ADMS_INCIDENT_KIND.CLOCK_DRIFT,
        severity: 'warning',
        title: 'El reloj del checador esta corrido',
        detail:
          'Las checadas de este equipo llegan con una diferencia sostenida respecto a la hora del servidor. Mientras no se corrija, entran a nomina con la hora del aparato.',
        key: 'reloj-corrido',
        median,
      })
    }

    return { medianSeconds: median, driftDetected, dstSuspected, discarded }
  }

  /**
   * La deriva bajo del umbral: si habia un ajuste esperando confirmacion, esta
   * es la evidencia que el acuse nunca pudo dar (spec 6.7).
   */
  async markVerified(
    accessPointId: number,
    businessUnitId: number,
    now: DateTime
  ): Promise<void> {
    await this.repository.setStatus(accessPointId, businessUnitId, 'ok', now)
  }

  async markStatus(
    accessPointId: number,
    businessUnitId: number,
    status: AccessPointClockSyncStatus
  ): Promise<void> {
    await this.repository.setStatus(accessPointId, businessUnitId, status)
  }

  private async recordIncident(
    input: ClockObservationInput,
    incident: {
      kind: (typeof ADMS_INCIDENT_KIND)[keyof typeof ADMS_INCIDENT_KIND]
      severity: 'info' | 'warning' | 'error'
      title: string
      detail: string
      key: string
      median: number
    }
  ): Promise<void> {
    await this.incidents.record(
      {
        kind: incident.kind,
        severity: incident.severity,
        code: ADMS_ERROR_CODES.VAL_TIMEZONE_INVALID,
        title: incident.title,
        detail: incident.detail,
        key: incident.key,
        serial: input.serial,
        accessPointId: input.accessPointId,
        businessUnitId: input.businessUnitId,
        context: { driftSeconds: incident.median },
        now: input.now,
      },
      { dedupeMinutes: DRIFT_DEDUPE_MINUTES }
    )
  }
}

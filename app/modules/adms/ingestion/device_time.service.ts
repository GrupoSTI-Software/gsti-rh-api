import { DateTime } from 'luxon'
import { getBusinessTimeZone } from '#utils/business_date'

export type DeviceTimeResult =
  | { ok: true; utc: DateTime }
  | { ok: false; reason: 'invalid_zone' | 'invalid_time' }

export interface ResolvedZone {
  zone: string
  /** Verdadero cuando la zona configurada no existe y se uso la del sistema. */
  fellBack: boolean
}

/**
 * Hora del checador a UTC (spec v2, 5.3).
 *
 * El equipo manda hora LOCAL sin zona. La zona sale del punto de acceso, si no
 * de la empresa, si no del sistema. Una zona mal configurada nunca retiene el
 * acuse ni la checada: se usa la del sistema y el llamador levanta el incidente
 * `timezone_invalid` (spec 15).
 */
export default class DeviceTimeService {
  resolveZone(deviceZone: string | null, businessUnitZone: string | null): ResolvedZone {
    const candidate = deviceZone ?? businessUnitZone
    if (candidate === null || candidate.trim().length === 0) {
      return { zone: getBusinessTimeZone(), fellBack: false }
    }
    if (!DateTime.now().setZone(candidate).isValid) {
      return { zone: getBusinessTimeZone(), fellBack: true }
    }
    return { zone: candidate, fellBack: false }
  }

  /**
   * `assist_punch_time_utc` va en UTC real, igual que la app (spec 15): la
   * conversion es explicita, no se delega a la zona del proceso.
   */
  toUtc(localTime: string, zone: string): DeviceTimeResult {
    const parsed = DateTime.fromFormat(localTime, 'yyyy-MM-dd HH:mm:ss', { zone })
    if (!parsed.isValid) return { ok: false, reason: 'invalid_time' }
    return { ok: true, utc: parsed.toUTC() }
  }
}

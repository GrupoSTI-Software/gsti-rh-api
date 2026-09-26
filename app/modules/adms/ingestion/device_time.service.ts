import { DateTime } from 'luxon'
import { resolveSiteTimeZone } from '#modules/attendance-time/attendance_clock'

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
 * acuse ni la checada: se usa la siguiente de la cadena y el llamador levanta el
 * incidente `timezone_invalid` (spec 15). La cadena es la misma que usa el
 * resto de asistencia (`#modules/attendance-time`).
 */
export default class DeviceTimeService {
  resolveZone(deviceZone: string | null, businessUnitZone: string | null): ResolvedZone {
    const resolved = resolveSiteTimeZone([
      { zone: deviceZone, source: 'access_point' },
      { zone: businessUnitZone, source: 'business_unit' },
    ])
    return { zone: resolved.zone, fellBack: resolved.fellBack }
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

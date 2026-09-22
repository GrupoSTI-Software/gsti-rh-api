import { DateTime } from 'luxon'
import { getBusinessTimeZone } from '#utils/business_date'
import type {
  ResolvedSiteTimeZone,
  SiteTimeZoneCandidate,
} from './attendance_time.interface.js'

/**
 * Reloj de asistencia: funciones puras para pasar entre instantes UTC y la hora
 * civil del sitio donde se trabaja el turno.
 *
 * Regla única del producto: `assists.assist_punch_time_utc` es un instante UTC
 * real. Toda interpretación como hora de pared se hace aquí, con la zona IANA
 * del sitio (sucursal, o empresa, o sistema). Las zonas IANA traen el horario
 * de verano que corresponda: `America/Ciudad_Juarez` lo aplica y
 * `America/Mexico_City` no lo aplica desde 2022. Nunca se calcula un offset a
 * mano fuera de este slice.
 */

/** Indica si `zone` es un identificador IANA que Luxon reconoce. */
export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (typeof zone !== 'string' || zone.trim().length === 0) return false
  return DateTime.now().setZone(zone).isValid
}

/**
 * Zona efectiva de un sitio: el primer candidato válido de la cadena, y si
 * ninguno lo es, la del sistema. Un candidato configurado pero inválido no
 * detiene nada: se salta y se marca `fellBack` para que el llamador avise.
 *
 * @param candidates Zonas en orden de prioridad (punto de acceso, sucursal, empresa).
 * @param systemZone Zona del sistema; por defecto la de negocio configurada.
 */
export function resolveSiteTimeZone(
  candidates: SiteTimeZoneCandidate[],
  systemZone: string = getBusinessTimeZone()
): ResolvedSiteTimeZone {
  let fellBack = false
  for (const candidate of candidates) {
    const zone = candidate.zone?.trim() ?? ''
    if (zone.length === 0) continue
    if (isValidTimeZone(zone)) {
      return { zone, source: candidate.source, fellBack }
    }
    fellBack = true
  }
  return { zone: systemZone, source: 'system', fellBack }
}

/**
 * Normaliza una hora de turno (`HH:mm` o `HH:mm:ss`) a `HH:mm:ss`. Devuelve
 * `null` si no tiene esa forma.
 */
function normalizeClockTime(clockTime: string | null | undefined): string | null {
  if (typeof clockTime !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(clockTime.trim())
  if (!match) return null
  const [, hours, minutes, seconds = '00'] = match
  return `${hours.padStart(2, '0')}:${minutes}:${seconds}`
}

/**
 * Instante (UTC) en que inicia el turno de un día civil en la zona del sitio.
 * Devuelve un `DateTime` inválido si el día o la hora no tienen forma; el
 * llamador consulta `isValid` antes de operar.
 *
 * @param dayIso Día civil `yyyy-MM-dd` del turno.
 * @param shiftTimeStart Hora de inicio del turno, `HH:mm:ss` o `HH:mm`.
 * @param zone Zona IANA del sitio.
 */
export function shiftStartInstant(dayIso: string, shiftTimeStart: string, zone: string): DateTime {
  const clockTime = normalizeClockTime(shiftTimeStart)
  if (!clockTime) return DateTime.invalid('shift-time-invalid')
  return DateTime.fromISO(`${dayIso}T${clockTime}`, { zone }).toUTC()
}

/**
 * Instante (UTC) en que termina el turno: inicio más las horas activas. Las
 * horas se suman como duración, así que un turno que cruza un cambio de
 * horario de verano conserva su duración real.
 */
export function shiftEndInstant(
  dayIso: string,
  shiftTimeStart: string,
  shiftActiveHours: number,
  zone: string
): DateTime {
  const start = shiftStartInstant(dayIso, shiftTimeStart, zone)
  if (!start.isValid) return start
  return start.plus({ seconds: Math.round(shiftActiveHours * 3600) })
}

/**
 * Convierte un instante a la hora de pared del sitio. Acepta el ISO con `Z`
 * que devuelve el API, un `Date` del driver o un `DateTime` de Luxon; un
 * valor sin zona explícita se toma como UTC, que es lo que guarda la columna.
 */
export function wallTime(instant: string | Date | DateTime, zone: string): DateTime {
  return toInstant(instant).setZone(zone)
}

/** Día civil `yyyy-MM-dd` del sitio al que pertenece un instante. */
export function dayKeyOf(instant: string | Date | DateTime, zone: string): string {
  return wallTime(instant, zone).toFormat('yyyy-LL-dd')
}

/**
 * Horas que hay que sumar a la hora de pared del sitio para llegar a UTC en
 * un día dado (6 para Ciudad de México todo el año; 7 para Ciudad Juárez en
 * verano y 6 en invierno). Sirve para las consultas SQL que necesitan una
 * ventana aproximada; la clasificación exacta usa los instantes.
 */
export function utcOffsetHours(zone: string, dayIso: string): number {
  const noon = DateTime.fromISO(`${dayIso}T12:00:00`, { zone })
  if (!noon.isValid) return 0
  return -noon.offset / 60
}

/** Ahora, expresado en la zona del sitio. */
export function nowInZone(zone: string): DateTime {
  return DateTime.now().setZone(zone)
}

/**
 * Lleva a un `DateTime` en UTC cualquier representación de instante que
 * circula en el sistema. La cadena sin zona se interpreta como UTC porque así
 * la entrega el driver cuando la columna se lee sin conversión.
 */
export function toInstant(value: string | Date | DateTime): DateTime {
  if (DateTime.isDateTime(value)) return value.toUTC()
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: 'utc' })
  const parsed = DateTime.fromISO(value, { zone: 'utc', setZone: true })
  if (parsed.isValid) return parsed.toUTC()
  return DateTime.fromSQL(value, { zone: 'utc' }).toUTC()
}

import { DateTime } from 'luxon'
import env from '#start/env'

const DEFAULT_ZONE = 'America/Mexico_City'

/** Zona IANA usada para comparar fechas de negocio (p. ej. vigencia de contratos REPSE). */
export function getBusinessTimeZone(): string {
  return env.get('APP_BUSINESS_TIMEZONE') ?? DEFAULT_ZONE
}

/** Inicio del día civil actual en la zona de negocio configurada. */
export function todayInBusinessZone(): DateTime {
  return DateTime.now().setZone(getBusinessTimeZone()).startOf('day')
}

/** Fecha ISO (`YYYY-MM-DD`) del día actual en zona de negocio, para comparaciones SQL. */
export function toBusinessDateString(reference: DateTime = todayInBusinessZone()): string {
  return reference.toISODate()!
}

/**
 * Compara fechas civiles (YYYY-MM-DD) sin desfase por UTC en columnas DATE.
 * "Ya pasó" = estrictamente menor que hoy en zona de negocio.
 */
export function isBusinessCalendarDateBefore(
  isoDate: string | null | undefined,
  hoyIso: string = toBusinessDateString()
): boolean {
  if (!isoDate) {
    return false
  }
  return isoDate < hoyIso
}

/** Normaliza un valor DATE de Lucid/SQL a YYYY-MM-DD para comparación civil. */
export function toCalendarIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (DateTime.isDateTime(value)) {
    return value.toISODate()
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate()
  }
  const raw = String(value)
  const datePart = raw.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart
  }
  const parsed = DateTime.fromISO(raw)
  return parsed.isValid ? parsed.toISODate() : null
}

/**
 * Días civiles completos entre dos fechas ISO (YYYY-MM-DD) en zona de negocio.
 * Convención: el día `from` cuenta; el día `to` NO cuenta (es el borde).
 * Devuelve negativo si `to` es anterior a `from`.
 */
export function daysBetweenBusinessDates(fromIso: string, toIso: string): number {
  const zone = getBusinessTimeZone()
  const from = DateTime.fromISO(fromIso, { zone }).startOf('day')
  const to = DateTime.fromISO(toIso, { zone }).startOf('day')
  return Math.round(to.diff(from, 'days').days)
}

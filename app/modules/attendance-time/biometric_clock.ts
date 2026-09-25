import { DateTime } from 'luxon'

/**
 * Reloj del checador BioTime. Es el ÚNICO lugar del sistema que conoce cómo
 * mienten esos equipos, y solo lo usa quien escribe checadas que vienen de
 * ellos (el puente de sincronización y el respaldo histórico).
 *
 * El equipo guarda `punch_time` como hora de pared más un offset propio: aplica
 * su horario de verano del primer domingo de abril al último de octubre (+5) y
 * el resto del año +6, aunque el horario civil mexicano no cambia desde 2022.
 * Ese valor no es un instante UTC real y no se compara con nada: se convierte
 * a UTC real al escribirlo y desde ahí el resto del sistema no vuelve a saber
 * de esta regla.
 */

/** Primer domingo de abril y último domingo de octubre del año, `yyyy-MM-dd`. */
export function biometricSummerWindow(year: number): { start: string; end: string } {
  const aprilFirst = new Date(Date.UTC(year, 3, 1))
  const start = new Date(Date.UTC(year, 3, 1 + ((7 - aprilFirst.getUTCDay()) % 7)))
  const octoberLast = new Date(Date.UTC(year, 9, 31))
  const end = new Date(Date.UTC(year, 9, 31 - octoberLast.getUTCDay()))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/** Horas que el checador sumó a la hora de pared de ese día civil. */
export function biometricUtcOffsetHours(dayIso: string): number {
  const window = biometricSummerWindow(Number(dayIso.slice(0, 4)))
  return dayIso >= window.start && dayIso <= window.end ? 5 : 6
}

/**
 * Hora de pared que marcó el checador, a partir del valor que guardó. El día
 * civil que decide el offset se toma del propio valor; cerca de la medianoche
 * el primer cálculo puede caer en el día vecino, por eso se recalcula una vez
 * con la pared obtenida.
 *
 * @param stored Valor guardado por el checador, leído como naive (sus componentes son la pared más el offset).
 */
export function biometricWallTime(stored: DateTime): DateTime {
  const naive = stored.toUTC()
  let offset = biometricUtcOffsetHours(naive.minus({ hours: 6 }).toFormat('yyyy-LL-dd'))
  let wall = naive.minus({ hours: offset })
  const recomputed = biometricUtcOffsetHours(wall.toFormat('yyyy-LL-dd'))
  if (recomputed !== offset) {
    offset = recomputed
    wall = naive.minus({ hours: offset })
  }
  return wall
}

/**
 * Convierte el valor guardado por el checador al instante UTC real, tomando
 * la hora de pared en la zona IANA del sitio donde está el equipo.
 *
 * @param stored Valor del checador como naive (`Z` o sin zona).
 * @param siteZone Zona IANA del sitio.
 */
export function biometricStoredToUtc(stored: DateTime, siteZone: string): DateTime {
  const wall = biometricWallTime(stored)
  return DateTime.fromObject(
    {
      year: wall.year,
      month: wall.month,
      day: wall.day,
      hour: wall.hour,
      minute: wall.minute,
      second: wall.second,
    },
    { zone: siteZone }
  ).toUTC()
}

/**
 * Lee el valor naive que manda el puente o que devuelve la base. Una cadena
 * sin zona se toma como UTC para que sus componentes queden intactos; una
 * con zona se respeta.
 */
export function parseBiometricStored(value: string | Date | DateTime): DateTime {
  if (DateTime.isDateTime(value)) return value
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: 'utc' })
  const iso = DateTime.fromISO(value, { zone: 'utc', setZone: true })
  if (iso.isValid) return iso
  return DateTime.fromSQL(value, { zone: 'utc' })
}

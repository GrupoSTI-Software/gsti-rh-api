import { DateTime } from 'luxon'
import { biometricWallTime, parseBiometricStored } from '#modules/attendance-time/biometric_clock'
import type {
  AttendanceTolerances,
  CheckInBucket,
  CheckOutBucket,
} from '#modules/attendance-time/attendance_time.interface'

/**
 * COPIA CONGELADA de la regla de clasificación que tenía `SyncAssistsService`
 * antes de unificar la zona horaria en `attendance-time`. Existe solo para que
 * `attendance:reconcile-timezone` compare el resultado anterior con el vigente
 * y liste los días que cambian de bucket. Vive aquí y no en `commands/`
 * porque Ace carga como comando todo archivo de esa carpeta. No se usa en producción, no se
 * corrige y no se extiende: si la regla vigente cambia, este archivo se queda
 * como estaba, porque su valor es reproducir el pasado.
 *
 * Regla legada de entrada: el turno se armaba en `-06:00` fijo con un minuto
 * de gracia (`plus({ minutes: 1 })`) y la checada se leía con `setZone('UTC-6')`,
 * es decir, como si `assist_punch_time_utc` fuera UTC real.
 *
 * Regla legada de salida (USRH1785436961903): el fin del turno en `-06:00`
 * fijo menos un minuto, y la checada leída como hora de pared del checador
 * (offset +5 de abril a octubre, +6 el resto), tolerancia de salida de 10
 * minutos fija.
 */

const LEGACY_ZONE = 'UTC-6'
const LEGACY_CHECK_OUT_TOLERANCE_MINUTES = 10

/** Hora de inicio del turno tal como la armaba el sync: día + hora en -06:00 + 1 minuto. */
function legacyShiftStart(day: string, shiftTimeStart: string): DateTime {
  return DateTime.fromISO(`${day}T${shiftTimeStart}.000-06:00`, { setZone: true })
    .setZone(LEGACY_ZONE)
    .plus({ minutes: 1 })
}

/** Fin del turno tal como lo armaba el sync: inicio + horas activas en minutos - 1. */
function legacyShiftEnd(day: string, shiftTimeStart: string, shiftActiveHours: number): DateTime {
  return DateTime.fromISO(`${day}T${shiftTimeStart}.000-06:00`, { setZone: true })
    .setZone(LEGACY_ZONE)
    .plus({ minutes: shiftActiveHours * 60 - 1 })
}

/**
 * Bucket de entrada con la regla legada. Sin checada es falta.
 *
 * @param day Día civil `yyyy-MM-dd` del turno.
 * @param shiftTimeStart Hora de inicio `HH:mm:ss`.
 * @param punchUtc Valor guardado en `assist_punch_time_utc` (ISO), o `null`.
 */
export function legacyCheckInBucket(
  day: string,
  shiftTimeStart: string,
  punchUtc: string | null,
  tolerances: AttendanceTolerances
): CheckInBucket {
  if (!punchUtc) return 'fault'
  const start = legacyShiftStart(day, shiftTimeStart)
  const punch = DateTime.fromISO(punchUtc, { setZone: true }).setZone(LEGACY_ZONE)
  const diffMinutes = punch.diff(start, 'minutes').minutes
  if (diffMinutes > tolerances.faultMinutes) return 'fault'
  if (diffMinutes > tolerances.delayMinutes) return 'delay'
  if (diffMinutes <= 0) return 'ontime'
  return 'tolerance'
}

/**
 * Bucket de salida con la regla legada (pared del checador). Sin checada de
 * salida no hay bucket: el sync dejaba el estatus vacío.
 */
export function legacyCheckOutBucket(
  day: string,
  shiftTimeStart: string,
  shiftActiveHours: number,
  punchUtc: string | null
): CheckOutBucket | null {
  if (!punchUtc) return null
  const end = legacyShiftEnd(day, shiftTimeStart, shiftActiveHours)
  const wall = biometricWallTime(parseBiometricStored(punchUtc))
  // El sync re-armaba la pared como -06:00 antes de comparar.
  const punch = DateTime.fromISO(`${wall.toFormat("yyyy-LL-dd'T'HH:mm:ss")}.000-06:00`, {
    setZone: true,
  }).setZone(LEGACY_ZONE)
  const diffMinutes = end.diff(punch, 'minutes').minutes
  if (diffMinutes > LEGACY_CHECK_OUT_TOLERANCE_MINUTES) return 'delay'
  if (diffMinutes > 0) return 'tolerance'
  return 'ontime'
}

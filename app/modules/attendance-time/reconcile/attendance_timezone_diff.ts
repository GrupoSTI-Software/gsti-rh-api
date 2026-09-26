import { shiftEndInstant, shiftStartInstant, toInstant } from '#modules/attendance-time/attendance_clock'
import {
  bucketCheckIn,
  bucketCheckOut,
  minutesAfter,
} from '#modules/attendance-time/attendance_bucketing'
import type { AttendanceTolerances } from '#modules/attendance-time/attendance_time.interface'
import { legacyCheckInBucket, legacyCheckOutBucket } from './legacy_attendance_rule.js'

/** Lo mínimo de un día del calendario que hace falta para compararlo. */
export interface ReconcileDayInput {
  day: string
  shiftTimeStart: string
  shiftActiveHours: number
  checkInUtc: string | null
  checkOutUtc: string | null
}

/** Un cambio de bucket entre la regla legada y la vigente. */
export interface ReconcileDifference {
  day: string
  kind: 'check_in' | 'check_out'
  punchUtc: string | null
  previous: string
  current: string
}

/**
 * Compara, para un día, los buckets de entrada y salida de la regla legada
 * contra los de la regla vigente en la zona del sitio. Devuelve solo lo que
 * cambia; un día igual en las dos reglas no aparece. Es puro: la lectura del
 * calendario y la salida a consola o CSV viven en el comando.
 *
 * @param input Día con turno y checadas tal como las devuelve el calendario.
 * @param zone Zona IANA del sitio del colaborador.
 * @param tolerances Tolerancias vigentes de la empresa.
 */
export function diffAttendanceDay(
  input: ReconcileDayInput,
  zone: string,
  tolerances: AttendanceTolerances
): ReconcileDifference[] {
  const differences: ReconcileDifference[] = []

  const start = shiftStartInstant(input.day, input.shiftTimeStart, zone)
  if (!start.isValid) return differences

  const previousIn = legacyCheckInBucket(input.day, input.shiftTimeStart, input.checkInUtc, tolerances)
  const currentIn = input.checkInUtc
    ? bucketCheckIn(minutesAfter(start, toInstant(input.checkInUtc)), tolerances)
    : 'fault'
  if (previousIn !== currentIn) {
    differences.push({
      day: input.day,
      kind: 'check_in',
      punchUtc: input.checkInUtc,
      previous: previousIn,
      current: currentIn,
    })
  }

  if (input.checkOutUtc) {
    const end = shiftEndInstant(input.day, input.shiftTimeStart, input.shiftActiveHours, zone)
    const previousOut = legacyCheckOutBucket(
      input.day,
      input.shiftTimeStart,
      input.shiftActiveHours,
      input.checkOutUtc
    )
    const currentOut = bucketCheckOut(-minutesAfter(end, toInstant(input.checkOutUtc)), tolerances)
    if (previousOut !== currentOut) {
      differences.push({
        day: input.day,
        kind: 'check_out',
        punchUtc: input.checkOutUtc,
        previous: previousOut ?? '',
        current: currentOut,
      })
    }
  }

  return differences
}

import type { DateTime } from 'luxon'
import type {
  AttendanceTolerances,
  CheckInBucket,
  CheckOutBucket,
} from './attendance_time.interface.js'

/**
 * Buckets de entrada y salida. Es la única implementación de la regla: la
 * consumen el calendario del sync, las estadísticas y los reportes, de modo
 * que un día no pueda ser "a tiempo" en una pantalla y "falta" en otra.
 *
 * La granularidad es el minuto: los segundos se truncan. Llegar 08:00:53 con
 * turno de 08:00 son 0 minutos tarde y es a tiempo; 08:01:00 ya es tolerancia.
 */

/** Minutos completos entre el instante esperado y el real (positivo = después). */
export function minutesAfter(expected: DateTime, actual: DateTime): number {
  return Math.floor(actual.diff(expected, 'minutes').minutes)
}

/**
 * Clasifica la entrada por minutos de retraso.
 *
 * - `<= 0` a tiempo.
 * - `1 .. delayMinutes` tolerancia.
 * - `delayMinutes + 1 .. faultMinutes` retardo.
 * - `> faultMinutes` falta.
 */
export function bucketCheckIn(minutesLate: number, tolerances: AttendanceTolerances): CheckInBucket {
  if (minutesLate > tolerances.faultMinutes) return 'fault'
  if (minutesLate > tolerances.delayMinutes) return 'delay'
  if (minutesLate <= 0) return 'ontime'
  return 'tolerance'
}

/**
 * Clasifica la salida por minutos de anticipación.
 *
 * - `<= 0` a tiempo (salió a su hora o después).
 * - `1 .. delayMinutes` tolerancia.
 * - `> delayMinutes` salida anticipada (`delay` en el modelo).
 */
export function bucketCheckOut(minutesEarly: number, tolerances: AttendanceTolerances): CheckOutBucket {
  if (minutesEarly > tolerances.delayMinutes) return 'delay'
  if (minutesEarly > 0) return 'tolerance'
  return 'ontime'
}

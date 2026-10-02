import type { AssistDayInterface } from '../../interfaces/assist_day_interface.js'

/**
 * Días que cuentan para el bloqueo de asistencia: los ya cerrados, antes de
 * hoy en la zona del sitio. El día en curso todavía no se decide, y el
 * bloqueo se consulta justo cuando el colaborador va a checar: contarlo
 * bloqueaba a quien llegaba tarde antes de que registrara su entrada.
 */
export function closedLockDays(
  calendar: AssistDayInterface[],
  todayIso: string
): AssistDayInterface[] {
  return calendar.filter((entry) => entry.day < todayIso)
}

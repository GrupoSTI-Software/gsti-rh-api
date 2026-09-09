import type { DateTime } from 'luxon'

/** Rango de recálculo pendiente para un colaborador. */
export interface CalendarRecalcJob {
  businessUnitId: number
  employeeId: number
  from: DateTime
  to: DateTime
}

/**
 * Puerto de la cola de recálculo (spec ADMS 5.4). El canal del checador no
 * puede recalcular dentro de la petición: el equipo espera un acuse en
 * segundos y el recálculo de un colaborador tarda mucho más.
 */
export interface CalendarRecalcRepository {
  enqueue(jobs: CalendarRecalcJob[]): Promise<void>
}

import type {
  AttendanceStatsFilters,
  EmployeeCalendarBundle,
} from './dto/attendance-stats.dto.js'

/**
 * Contrato del repositorio de attendance-stats.
 *
 * Devuelve los calendarios computados en memoria para todos los empleados del
 * scope. Cada calendario es output crudo de `syncAssistsService.index`, que
 * lee de `assists` (no de `employee_assist_calendars`) y aplica toda la lógica
 * de tolerancias, DST, holidays, exceptions y shift changes del sistema.
 *
 * El service consume estos calendarios y produce los counters finales.
 */
export interface AttendanceStatsRepository {
  getEmployeeCalendars(
    effectiveFilters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeCalendarBundle[]>
}

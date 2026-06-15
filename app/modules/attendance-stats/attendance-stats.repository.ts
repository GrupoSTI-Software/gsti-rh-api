import type {
  AttendanceStatsFilters,
  CoverageActiveLoanRow,
  CoverageShiftQuotaRow,
  CoverageSiteRef,
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

  /** Sitios de servicio REPSE ligados a una empresa contratante en scope. */
  getSitesByCompany(
    companyId: number,
    allowedBusinessUnitIds: number[],
    branchOfficeIds?: number[]
  ): Promise<CoverageSiteRef[]>

  /** Cuotas bulk por sucursales (solo turnos no temporales). */
  getShiftQuotasByBranchIds(branchOfficeIds: number[]): Promise<CoverageShiftQuotaRow[]>

  /** Préstamos temporales vigentes en una fecha ISO yyyy-MM-dd. */
  getActiveLoansForDay(day: string, allowedBusinessUnitIds: number[]): Promise<CoverageActiveLoanRow[]>
}

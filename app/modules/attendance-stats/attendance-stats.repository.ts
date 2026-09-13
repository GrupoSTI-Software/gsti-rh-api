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
    empresaContratanteId: number,
    allowedBusinessUnitIds: number[],
    branchOfficeIds?: number[]
  ): Promise<CoverageSiteRef[]>

  /**
   * Cuotas bulk por sucursales (solo turnos no temporales). Solo devuelve
   * cuotas de sucursales vivas de las unidades de negocio permitidas; con la
   * lista de unidades vacía no devuelve nada.
   */
  getShiftQuotasByBranchIds(
    branchOfficeIds: number[],
    allowedBusinessUnitIds: number[]
  ): Promise<CoverageShiftQuotaRow[]>

  /**
   * Préstamos temporales vigentes en una fecha ISO yyyy-MM-dd. Descarta los
   * préstamos cuya sucursal de origen o destino no pertenece a las unidades
   * de negocio permitidas.
   */
  getActiveLoansForDay(day: string, allowedBusinessUnitIds: number[]): Promise<CoverageActiveLoanRow[]>

  /**
   * Nombres de sucursales por id (lectura bulk para candidatos de cobertura).
   * Solo resuelve sucursales de las unidades de negocio permitidas.
   */
  getBranchOfficeNamesByIds(
    branchOfficeIds: number[],
    allowedBusinessUnitIds: number[]
  ): Promise<Map<number, string>>

  /**
   * De `employeeIds`, los que un usuario sin acceso completo a la plantilla
   * puede ver: los que tiene a cargo (`user_responsible_employees` vigentes)
   * y el colaborador que es él mismo. Misma regla que el listado de empleados.
   */
  getEmployeeIdsInResponsibleScope(
    userId: number,
    employeeIds: number[],
    allowedBusinessUnitIds: number[]
  ): Promise<number[]>
}

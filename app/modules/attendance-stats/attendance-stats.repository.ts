import type {
  AttendanceStatsFilters,
  CoverageActiveLoanRow,
  CoverageRangeLoanRow,
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
   * de negocio permitidas. Orden: start_date descendente y, empatando, id
   * descendente; con varios vigentes por colaborador, el primero es el que
   * lo mueve ese día.
   */
  getActiveLoansForDay(day: string, allowedBusinessUnitIds: number[]): Promise<CoverageActiveLoanRow[]>

  /**
   * Colaboradores que pueden tener faltas en `siteIds` dentro de [startDay, endDay]:
   * los de las unidades de negocio permitidas (no borrados ni discriminados de
   * asistencia) con sucursal base activa en alguno de los sitios o con un
   * préstamo hacia ellos que intersecta el rango. Es un pre-filtro: la
   * atribución exacta por día la resuelve la construcción de la respuesta. Sin
   * sitios o sin unidades de negocio no devuelve nada.
   */
  getCoverageAbsencesEmployeeIds(
    siteIds: number[],
    startDay: string,
    endDay: string,
    allowedBusinessUnitIds: number[]
  ): Promise<number[]>

  /**
   * Préstamos de `employeeIds` que intersectan [startDay, endDay], hacia
   * cualquier sucursal: uno hacia fuera de los sitios también mueve al
   * colaborador. Descarta los borrados, los cancelados a más tardar en
   * `startDay` y los que tienen origen o destino fuera de las unidades de
   * negocio permitidas. Orden: start_date descendente y, empatando, id
   * descendente. Sin colaboradores o sin unidades de negocio no devuelve nada.
   */
  getLoansForRange(
    employeeIds: number[],
    startDay: string,
    endDay: string,
    allowedBusinessUnitIds: number[]
  ): Promise<CoverageRangeLoanRow[]>

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

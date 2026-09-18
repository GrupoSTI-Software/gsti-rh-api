import type {
  AbsencesBranch,
  AttendanceStatsFilters,
  CoverageRangeLoanRow,
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

  /**
   * Universo de ausencias: la plantilla de las unidades de negocio permitidas
   * (no borrados ni discriminados de asistencia), un id por colaborador. Con
   * `branchOfficeIds` (no vacío) solo quienes tienen sucursal base activa en
   * ellas o un préstamo hacia ellas que intersecta [startDay, endDay]. Sin
   * unidades de negocio no devuelve nada.
   */
  getAbsencesEmployeeIds(
    startDay: string,
    endDay: string,
    allowedBusinessUnitIds: number[],
    branchOfficeIds?: number[]
  ): Promise<number[]>

  /**
   * Catálogo de sucursales para ausencias: las de `branchOfficeIds` vivas y de
   * las unidades de negocio permitidas, con su empresa contratante solo si está
   * viva y es del tenant (`toAbsencesBranch`). Sin ids o sin unidades de
   * negocio no devuelve nada.
   */
  getAbsencesBranches(
    branchOfficeIds: number[],
    allowedBusinessUnitIds: number[]
  ): Promise<AbsencesBranch[]>

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

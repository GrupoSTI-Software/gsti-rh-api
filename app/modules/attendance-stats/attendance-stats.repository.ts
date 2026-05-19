import type {
  AttendanceStatsFilters,
  DepartmentCountersRow,
  EmployeeCountersRow,
  OverviewCountersRow,
} from './dto/attendance-stats.dto.js'

/**
 * Contrato del repositorio de attendance-stats.
 *
 * `effectiveFilters` ya incluye el scope multitenant del usuario aplicado
 * como AND (allowedBusinessUnitIds). Los repositorios NO deben aplicar
 * scope adicional — su responsabilidad es solo traducir filtros a SQL.
 */
export interface AttendanceStatsRepository {
  getOverview(
    effectiveFilters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<OverviewCountersRow>

  getByDepartment(
    effectiveFilters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<DepartmentCountersRow[]>

  getByEmployee(
    effectiveFilters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeCountersRow[]>
}

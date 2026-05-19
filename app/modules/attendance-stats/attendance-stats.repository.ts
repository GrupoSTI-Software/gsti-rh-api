import type {
  AttendanceStatsFilters,
  DepartmentBundle,
  EmployeeBundle,
  OverviewBundle,
} from './dto/attendance-stats.dto.js'

/**
 * Contrato del repositorio de attendance-stats.
 *
 * Cada método devuelve un bundle con 3 piezas:
 * - clean: agregados SQL sobre días SIN shift_exception (el check_in_status almacenado es confiable).
 * - informational: contadores de vacaciones, festivos y faltas justificadas (no entran al cierre 100%).
 * - permissionDays: filas crudas de días con `late-arrival` / `early-departure`. El service los
 *   recomputa en TS contra la hora autorizada por el permiso, reusando la lógica de tolerancia.
 *
 * El scope multitenant (allowedBusinessUnitIds) ya viene resuelto. Si llega vacío, el repo
 * retorna bundles vacíos por defensa — el service nunca debió haber llamado.
 */
export interface AttendanceStatsRepository {
  getOverview(
    effectiveFilters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<OverviewBundle>

  getByDepartment(
    effectiveFilters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<DepartmentBundle>

  getByEmployee(
    effectiveFilters: AttendanceStatsFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<EmployeeBundle>
}

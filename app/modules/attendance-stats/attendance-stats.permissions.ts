import RoleService from '#services/role_service'

/** Módulo del monitor de asistencias en el catálogo de permisos. */
export const ATTENDANCE_MONITOR_MODULE_SLUG = 'employees-attendance-monitor'

/**
 * Permiso de cobertura de plantilla del monitor. Abre GET /coverage y la
 * empresa contratante (cliente REPSE) de las sucursales en GET /absences.
 */
export const SHIFT_COVERAGE_PERMISSION_SLUG = 'shift-coverage'

/**
 * Fuente única de la regla `shift-coverage`: el controller la usa para
 * responder 403 en cobertura y el service para ocultar la empresa contratante
 * en ausencias. Root y owner pasan (`RoleService.hasAccess`).
 */
export function hasShiftCoverageAccess(roleId: number): Promise<boolean> {
  return new RoleService().hasAccess(
    roleId,
    ATTENDANCE_MONITOR_MODULE_SLUG,
    SHIFT_COVERAGE_PERMISSION_SLUG
  )
}

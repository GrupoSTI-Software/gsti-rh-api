import type { PermissionGateOptions } from '#constants/permission_gate'
import type { AttendanceMonitorActionSlug } from '#constants/attendance_monitor_permission_catalog'

/**
 * La acción se tipa contra el catálogo del monitor: un slug inventado no
 * compila, en lugar de terminar en un 403 para todos salvo root y owner.
 */
const monitorStandard = (action: AttendanceMonitorActionSlug): PermissionGateOptions => ({
  module: 'employees-attendance-monitor',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del Monitor de asistencia. Fuente única que consume
 * `start/routes/assist_routes.ts`.
 *
 * Las dos operaciones las dispara el panel de asistencia del backoffice, que se
 * monta en el detalle del monitor y en el del empleado. El panel ya ocultaba el
 * botón sin la casilla, pero el API no comprobaba nada: cualquier sesión del
 * tenant anulaba checadas o lanzaba la sincronización con el biométrico.
 *
 *  - `employeeSynchronizeAssists`: la sincronización por empleado exige
 *    `sync-assist`, la misma casilla que la sincronización general. La general
 *    (`POST /synchronize`) la sigue verificando su controller con `hasAccess`
 *    y responde con su propio código `AST.AUTHZ.003`.
 *  - `inactivateAssist`: anular una checada exige `delete-check-assist`.
 *
 * Bypass `standard` (root y owner): el código vigente no trata a
 * super-administrador como administrador de asistencia.
 */
export const EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS = {
  employeeSynchronizeAssists: monitorStandard('sync-assist'),
  inactivateAssist: monitorStandard('delete-check-assist'),
} as const satisfies Record<string, PermissionGateOptions>

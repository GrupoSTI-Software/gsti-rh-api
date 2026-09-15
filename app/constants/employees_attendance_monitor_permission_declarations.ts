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
 * Las operaciones las dispara el panel de asistencia del backoffice, que se
 * monta en el detalle del monitor y en el del empleado. El panel ya ocultaba el
 * botón sin la casilla, pero el API no comprobaba nada: cualquier sesión del
 * tenant anulaba checadas o lanzaba la sincronización con el biométrico.
 *
 *  - `synchronizeAssists` y `employeeSynchronizeAssists`: las dos vías de
 *    sincronización exigen `sync-assist`, la misma casilla. La general dejó de
 *    verificarla en su controller con `hasAccess`: eran dos piezas de control
 *    de acceso para la misma decisión y respondían distinto —`AST.AUTHZ.003`
 *    una, `PERM.DENIED` la otra—, así que el cliente tenía que conocer las dos
 *    formas de negativa. Ahora ambas responden como el gate.
 *  - `inactivateAssist`: anular una checada exige `delete-check-assist`.
 *
 * Bypass `standard` (root y owner): el código vigente no trata a
 * super-administrador como administrador de asistencia. Es el mismo alcance que
 * daba `RoleService.hasAccess`, que también dejaba pasar a root y owner.
 */
export const EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS = {
  synchronizeAssists: monitorStandard('sync-assist'),
  employeeSynchronizeAssists: monitorStandard('sync-assist'),
  inactivateAssist: monitorStandard('delete-check-assist'),
} as const satisfies Record<string, PermissionGateOptions>

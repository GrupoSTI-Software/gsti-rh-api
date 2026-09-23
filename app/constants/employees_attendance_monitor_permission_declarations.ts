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
 * DIFERENCIA DE ALCANCE respecto de `hasAccess`, deliberada y probada: el gate
 * consulta primero la exigencia del módulo y concede a cualquier sesión del
 * tenant cuando está apagada (`module-not-enforced`), cosa que `hasAccess` no
 * hacía —exigía `sync-assist` siempre—. El módulo está encendido en la
 * constante y en la siembra, así que hoy no hay hueco; el caso
 * `con la exigencia del módulo apagada...` de
 * `tests/functional/employees_attendance_monitor_permission_gate.spec.ts` deja
 * fijado qué pasa si alguien apaga el interruptor en BD. Endurecer las
 * escrituras del monitor con `evaluateEnforced` —como ya se hizo con el canal
 * ADMS y los biométricos del expediente— queda en el backlog de la fase 6.
 *
 * CONSUMIDOR: `employee-synchronize` la dispara el panel de asistencia del
 * backoffice (`use-employee-detail-actions.ts`). `POST /synchronize` NO tiene
 * consumidor vivo en ningún cliente: el único disparo real de la sincronización
 * general es el comando `sync:assistance`, que llama al servicio directo. Se le
 * puso gate en vez de retirarla; su retiro queda anotado en el backlog.
 *
 * Bypass `standard` (root y owner): el código vigente no trata a
 * super-administrador como administrador de asistencia. Es el mismo conjunto de
 * roles con salvoconducto que dejaba pasar `RoleService.hasAccess`.
 */
export const EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS = {
  synchronizeAssists: monitorStandard('sync-assist'),
  employeeSynchronizeAssists: monitorStandard('sync-assist'),
  inactivateAssist: monitorStandard('delete-check-assist'),
} as const satisfies Record<string, PermissionGateOptions>

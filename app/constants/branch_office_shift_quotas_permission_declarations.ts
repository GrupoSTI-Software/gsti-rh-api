import type { PermissionGateOptions } from '#constants/permission_gate'

/**
 * Bypass `expanded`: el dominio REPSE ya trata a `super-administrador` como su
 * administrador (`app/helpers/compliance_repse_rbac.ts`), igual que la otra
 * declaración del módulo (`repse_coverage_report_permission_declarations.ts`).
 */
const repseExpanded = (action: string | readonly string[]): PermissionGateOptions => ({
  module: 'repse-registrations',
  action,
  bypass: 'expanded',
})

/**
 * Declaraciones de permiso de las cuotas de plantilla por sucursal y turno
 * (`GET`/`PUT /api/branch-offices/:branchOfficeId/shift-quotas`). Las dos rutas
 * solo tenían `auth` y `businessScope`: cualquier sesión del tenant leía y
 * reescribía la plantilla requerida de cualquier sucursal en su alcance.
 *
 * ESCRITURA — un solo consumidor, y por eso va como gate de ruta:
 * el editor de cuotas del detalle de empresa contratante en REPSE
 * (`pages/repse/empresas-contratantes/[id]`). El backoffice solo muestra ese
 * botón con `canManage`, que es `repse-registrations:gestion`
 * (`use-empresa-contratantes-permissions.ts`, `sitioServicioInfoCard`), así que
 * `gestion` es la casilla que ya gobierna la operación en pantalla. Un rol con
 * solo `update` nunca ve el botón: no se le abre aquí una puerta que la pantalla
 * no le da.
 *
 * Por eso esta escritura NO sigue el patrón `acción ∨ gestion` del resto del
 * dominio REPSE (`compliance_repse_rbac.ts` resuelve todo con `hasAction ||
 * hasGestion`): la divergencia es deliberada y la respalda la pantalla, que
 * solo muestra el editor con `canManage`. Queda escrita aquí para que no haya
 * que reconstruirla desde el historial.
 *
 * LECTURA — DOS consumidores de módulos distintos, y por eso NO lleva gate de
 * ruta: la misma pantalla de REPSE y el formulario de préstamo temporal del
 * colaborador (`components/temporaryAssignmentForm`), que es Empleados y se
 * gobierna con `tab-trabajo-write`. Un gate de ruta declara un solo módulo, así
 * que cerrarla con REPSE rompería el préstamo y cerrarla con Empleados rompería
 * REPSE. La decide el controller aceptando cualquiera de los dos, con
 * `evaluateSecondaryPermission`.
 */
export const BRANCH_OFFICE_SHIFT_QUOTAS_PERMISSION_DECLARATIONS = {
  replaceBranchOfficeShiftQuotas: repseExpanded('gestion'),
} as const satisfies Record<string, PermissionGateOptions>

/**
 * Lado REPSE de la lectura. `read` abre la pantalla de empresas contratantes y
 * `gestion` la abre también (el backoffice da por leída la pantalla a quien
 * gestiona), así que la lectura acepta cualquiera de las dos.
 */
export const BRANCH_OFFICE_SHIFT_QUOTAS_REPSE_READ_PERMISSION: PermissionGateOptions =
  repseExpanded(['read', 'gestion'])

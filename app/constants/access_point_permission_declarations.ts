import type { PermissionGateBypass, PermissionGateOptions } from '#constants/permission_gate'
import {
  ACCESS_POINT_MODULE_SLUG,
  type AccessPointActionSlug,
} from '#constants/access_point_permission_catalog'

const accessPoints = (
  action: AccessPointActionSlug,
  bypass: PermissionGateBypass = 'standard'
): PermissionGateOptions => ({
  module: ACCESS_POINT_MODULE_SLUG,
  action,
  bypass,
})

/**
 * Declaraciones que consumen las rutas del canal ADMS hacia el Backoffice.
 * Toda ruta las resuelve con `evaluateEnforced` (spec ADMS 11): el interruptor
 * de exigencia del modulo esta apagado y `permissionGate` de ruta dejaria
 * pasar a cualquier autenticado.
 */
export const ACCESS_POINT_PERMISSION_DECLARATIONS = {
  readHealth: accessPoints('read-health'),
  claimDevice: accessPoints('claim-device', 'strict'),
  resetUploadProgress: accessPoints('reset-upload-progress'),
  manageCommands: accessPoints('manage-commands'),
  reconcilePins: accessPoints('reconcile-pins'),
} as const

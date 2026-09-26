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
 * Toda ruta las resuelve con `evaluateEnforced` (spec ADMS 11) y no con el
 * `permissionGate` de ruta. El modulo `biometric-devices` hoy exige permisos,
 * pero `evaluate` cortaria en `module-not-enforced` el dia que alguien apagara
 * ese interruptor en BD y abriria el canal a cualquier autenticado;
 * `evaluateEnforced` nunca lo consulta.
 */
export const ACCESS_POINT_PERMISSION_DECLARATIONS = {
  readHealth: accessPoints('read-health'),
  resetUploadProgress: accessPoints('reset-upload-progress'),
  manageCommands: accessPoints('manage-commands'),
  reconcilePins: accessPoints('reconcile-pins'),
} as const

import type { PermissionGateOptions } from '#constants/permission_gate'

const documentsExpirationMatrixStandard = (action: string): PermissionGateOptions => ({
  module: 'documents-expiration-matrix',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso de la Matriz de vencimientos
 * (`documents-expiration-matrix`). Fuente única que consumen
 * `start/routes/system_settings_proceeding_files_routes.ts` y
 * `start/routes/repse_registration_routes.ts`.
 *
 * La matriz es una vista agregada. Solo estos dos vencimientos son exclusivos
 * de ella y por eso exigen su `read`: antes no tenían gate y cualquier sesión
 * los leía. El resto de sus tarjetas lo gobierna el módulo dueño del dato
 * (pestañas de expediente y certificaciones de Empleados); un rol con la
 * matriz y sin esos permisos ve esas tarjetas vacías.
 */
export const DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS = {
  getExpiredAndExpiringSystemSettingProceedingFiles: documentsExpirationMatrixStandard('read'),
  getExpiredAndExpiringRepseRegistrations: documentsExpirationMatrixStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>

/**
 * Códigos estables para el cliente — plantillas de rol.
 * Prefijo PLT.RP = PLaTaforma · Rol Preset.
 */
export const ROLE_PRESET_ERROR_CODES = {
  /** La plantilla solicitada no existe */
  PRESET_NOT_FOUND: 'PLT.RP.PRESET_NOT_FOUND',
  /** Faltan permisos de la plantilla en la BD */
  MISSING_PERMISSIONS: 'PLT.RP.MISSING_PERMISSIONS',
  /** La versión esperada de la plantilla quedó obsoleta */
  STALE_PRESET_VERSION: 'PLT.RP.STALE_PRESET_VERSION',
  /** Los permisos del rol cambiaron respecto a la vista previa */
  STALE_ROLE_PERMISSIONS: 'PLT.RP.STALE_ROLE_PERMISSIONS',
  /** El rol de sistema no admite reconfiguración desde la empresa */
  SYSTEM_ROLE_LOCKED: 'PLT.RP.SYSTEM_ROLE_LOCKED',
  /** Falla genérica al aplicar la plantilla */
  APPLY_FAILED: 'PLT.RP.APPLY_FAILED',
} as const

export type RolePresetErrorCode =
  (typeof ROLE_PRESET_ERROR_CODES)[keyof typeof ROLE_PRESET_ERROR_CODES]

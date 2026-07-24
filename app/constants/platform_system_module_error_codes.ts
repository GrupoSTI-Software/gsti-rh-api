/**
 * Códigos estables para el cliente — administración de módulos de plataforma.
 * Prefijo PLT.MOD = PLaTaforma · MODulo.
 */
export const PLATFORM_SYSTEM_MODULE_ERROR_CODES = {
  /** Body inválido (Vine): `active` ausente o no booleano */
  VAL_INPUT: 'PLT.MOD.VAL_INPUT',
  /** Módulo inexistente para el id solicitado */
  MODULE_NOT_FOUND: 'PLT.MOD.MODULE_NOT_FOUND',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.MOD.SYS_UNHANDLED',
} as const

export type PlatformSystemModuleErrorCode =
  (typeof PLATFORM_SYSTEM_MODULE_ERROR_CODES)[keyof typeof PLATFORM_SYSTEM_MODULE_ERROR_CODES]

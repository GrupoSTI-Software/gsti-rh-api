/**
 * Códigos estables para el cliente — grupos de tenants de plataforma.
 * Prefijo PLT.GRP = PLaTaforma · GRuPos.
 */
export const PLATFORM_TENANT_GROUP_ERROR_CODES = {
  /** Body/query inválido (Vine) o PUT sin ningún campo */
  VAL_INPUT: 'PLT.GRP.VAL_INPUT',
  /** Grupo no encontrado por id (incluye dados de baja) */
  NOT_FOUND: 'PLT.GRP.NOT_FOUND',
  /** Nombre ya usado por un grupo vivo */
  NAME_TAKEN: 'PLT.GRP.NAME_TAKEN',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.GRP.SYS_UNHANDLED',
} as const

export type PlatformTenantGroupErrorCode =
  (typeof PLATFORM_TENANT_GROUP_ERROR_CODES)[keyof typeof PLATFORM_TENANT_GROUP_ERROR_CODES]

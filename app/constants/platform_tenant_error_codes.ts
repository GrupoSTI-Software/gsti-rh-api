/**
 * Códigos estables para el cliente — tenants de plataforma.
 * Prefijo PLT.TEN = PLaTaforma · TENants.
 */
export const PLATFORM_TENANT_ERROR_CODES = {
  /** Body/query inválido (Vine) */
  VAL_INPUT: 'PLT.TEN.VAL_INPUT',
  /** Empresa no encontrada por businessUnitPublicId */
  NOT_FOUND: 'PLT.TEN.NOT_FOUND',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.TEN.SYS_UNHANDLED',
  /** Empresa encontrada pero no modificable (estado no permite la operación) */
  UPDATE_FORBIDDEN: 'PLT.TEN.UPDATE_FORBIDDEN',
} as const

export type PlatformTenantErrorCode =
  (typeof PLATFORM_TENANT_ERROR_CODES)[keyof typeof PLATFORM_TENANT_ERROR_CODES]

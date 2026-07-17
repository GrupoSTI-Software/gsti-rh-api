/**
 * Códigos estables para el cliente — catálogo de cobro de plataforma.
 * Prefijo PLT.CAT = PLaTaforma · CATálogo.
 */
export const BILLING_CATALOG_ERROR_CODES = {
  /** Body/query inválido (Vine) */
  VAL_INPUT: 'PLT.CAT.VAL_INPUT',
  /** Plan no encontrado o sin precio vigente para la fecha solicitada */
  PLAN_NOT_FOUND: 'PLT.CAT.PLAN_NOT_FOUND',
  /** Intento de mutar una versión de precio publicada */
  PRICE_IMMUTABLE: 'PLT.CAT.PRICE_IMMUTABLE',
  /** Fecha de vigencia duplicada en el mismo plan */
  PRICE_EFFECTIVE_FROM_DUPLICATE: 'PLT.CAT.PRICE_EFFECTIVE_FROM_DUPLICATE',
  /** Tramo inválido (min_employees < 1 o discount_percent fuera de [0,100]) */
  TIER_INVALID: 'PLT.CAT.TIER_INVALID',
  /** Min_employees duplicado en el mismo plan */
  TIER_DUPLICATE: 'PLT.CAT.TIER_DUPLICATE',
  /** Mutación de tramo sobre plan publicado */
  TIER_PLAN_PUBLISHED: 'PLT.CAT.TIER_PLAN_PUBLISHED',
  /** Publicar plan sin los requisitos mínimos (sin tramo o sin precio) */
  PLAN_PUBLISH_REQUIREMENTS: 'PLT.CAT.PLAN_PUBLISH_REQUIREMENTS',
  /** Intento de publicar un plan ya publicado */
  PLAN_ALREADY_PUBLISHED: 'PLT.CAT.PLAN_ALREADY_PUBLISHED',
  /** Intento de eliminar un plan con suscripciones activas */
  PLAN_HAS_SUBSCRIPTIONS: 'PLT.CAT.PLAN_HAS_SUBSCRIPTIONS',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.CAT.SYS_UNHANDLED',
} as const

export type BillingCatalogErrorCode =
  (typeof BILLING_CATALOG_ERROR_CODES)[keyof typeof BILLING_CATALOG_ERROR_CODES]

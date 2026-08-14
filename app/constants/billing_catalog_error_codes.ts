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
  /** Vigencia nueva anterior a hoy cuando el plan ya tiene una versión corriendo */
  PRICE_EFFECTIVE_FROM_IN_PAST: 'PLT.CAT.PRICE_EFFECTIVE_FROM_IN_PAST',
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
  /** Intento de clonar un plan que no está publicado (es borrador) */
  CLONE_SOURCE_MUST_BE_PUBLISHED: 'PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED',
  /** Intento de clonar un plan desactivado */
  CLONE_SOURCE_DEACTIVATED: 'PLT.CAT.CLONE_SOURCE_DEACTIVATED',
  /** Ya existe un borrador clon vivo para el mismo plan origen */
  CLONE_DRAFT_EXISTS: 'PLT.CAT.CLONE_DRAFT_EXISTS',
  /** Intento de renombrar un plan publicado (el nombre solo se edita en borrador) */
  PLAN_NAME_IMMUTABLE: 'PLT.CAT.PLAN_NAME_IMMUTABLE',
  /** Tramo inexistente en el plan indicado (o eliminado lógicamente) */
  TIER_NOT_FOUND: 'PLT.CAT.TIER_NOT_FOUND',
  /** Intento de retirar un plan que no está publicado (borrador) */
  PLAN_DEACTIVATE_REQUIRES_PUBLISHED: 'PLT.CAT.PLAN_DEACTIVATE_REQUIRES_PUBLISHED',
  /** Intento de retirar un plan que ya está retirado */
  PLAN_ALREADY_DEACTIVATED: 'PLT.CAT.PLAN_ALREADY_DEACTIVATED',
  /** Intento de reactivar un plan retirado (0 → 1), por cualquier vía */
  PLAN_REACTIVATION_FORBIDDEN: 'PLT.CAT.PLAN_REACTIVATION_FORBIDDEN',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.CAT.SYS_UNHANDLED',
} as const

export type BillingCatalogErrorCode =
  (typeof BILLING_CATALOG_ERROR_CODES)[keyof typeof BILLING_CATALOG_ERROR_CODES]

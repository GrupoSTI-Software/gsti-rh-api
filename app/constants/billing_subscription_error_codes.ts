/**
 * Códigos estables para el cliente — suscripciones de la plataforma.
 * Prefijo PLT.SUB = PLaTaforma · SUBscripciones.
 *
 * Contrato fijado por spec-USRH1784574994919.md §6/§12 — no renombrar sin
 * escalar a Wilvardo (cambio de contrato).
 */
export const BILLING_SUBSCRIPTION_ERROR_CODES = {
  /** Body inválido (Vine) */
  VAL_INPUT: 'PLT.SUB.VAL_INPUT',
  /** Suscripción no encontrada (detalle) */
  NOT_FOUND: 'PLT.SUB.NOT_FOUND',
  /** Empresa (business unit) no encontrada / fuera del guard */
  BUSINESS_UNIT_NOT_FOUND: 'PLT.SUB.BUSINESS_UNIT_NOT_FOUND',
  /** La empresa existe pero está inactiva */
  BUSINESS_UNIT_INACTIVE: 'PLT.SUB.BUSINESS_UNIT_INACTIVE',
  /** El plan seleccionado no existe */
  PLAN_NOT_FOUND: 'PLT.SUB.PLAN_NOT_FOUND',
  /** Solo se puede contratar sobre un plan publicado */
  PLAN_NOT_PUBLISHED: 'PLT.SUB.PLAN_NOT_PUBLISHED',
  /** El plan no tiene un precio vigente en el catálogo */
  NO_ACTIVE_PRICE: 'PLT.SUB.NO_ACTIVE_PRICE',
  /** La empresa ya tiene una suscripción viva (trialing/active/past_due) */
  ALREADY_LIVE: 'PLT.SUB.ALREADY_LIVE',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.SUB.SYS_UNHANDLED',
} as const

export type BillingSubscriptionErrorCode =
  (typeof BILLING_SUBSCRIPTION_ERROR_CODES)[keyof typeof BILLING_SUBSCRIPTION_ERROR_CODES]

/**
 * Códigos estables para el cliente — suscripciones de la plataforma.
 * Prefijo PLT.SUB = PLaTaforma · SUBscripciones.
 *
 * Contrato fijado por spec-USRH1784574994919.md §6/§12 y extendido por
 * spec-USRH1784574994920.md §6 — no renombrar sin
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
  /** La suscripción está cancelada y no admite operaciones (cambio de plan, cobro) */
  SUBSCRIPTION_CANCELED: 'PLT.SUB.SUBSCRIPTION_CANCELED',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.SUB.SYS_UNHANDLED',
  /** La cantidad contratada self-service debe ser múltiplo de 10 y ≥ 10 */
  EMPLOYEES_NOT_BLOCK_OF_TEN: 'PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN',
  /** La cantidad contratada rebasa el tope defensivo de la superficie pública */
  EMPLOYEES_ABOVE_SAFETY_CAP: 'PLT.SUB.EMPLOYEES_ABOVE_SAFETY_CAP',
  /** El borrador de registro no trae plan/cantidad (draft anterior al cambio de flujo) */
  PLAN_NOT_SELECTED: 'PLT.SUB.PLAN_NOT_SELECTED',
  /** La cantidad contratada es menor que la plantilla activa redondeada al bloque de 10 */
  EMPLOYEES_BELOW_ACTIVE_HEADCOUNT: 'PLT.SUB.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT',
  /** Solo una empresa nacida del registro self-service puede contratar desde el backoffice */
  ORIGIN_NOT_SELF_SERVICE: 'PLT.SUB.ORIGIN_NOT_SELF_SERVICE',
  /** Sin suscripción viva para previsualizar cambio de cantidad (USRH1786107870847) */
  NO_LIVE_SUBSCRIPTION: 'PLT.SUB.NO_LIVE_SUBSCRIPTION',
  /** Suscripción con pago atrasado; debe regularizarse antes de cambiar cantidad */
  SUBSCRIPTION_PAST_DUE: 'PLT.SUB.SUBSCRIPTION_PAST_DUE',
  /** Periodo vigente sin días por delante para prorratear */
  PERIOD_NOT_PRORATABLE: 'PLT.SUB.PERIOD_NOT_PRORATABLE',
  /** Solo el dueño de la cuenta puede consultar el costo del cambio */
  FORBIDDEN_ROLE: 'PLT.SUB.FORBIDDEN_ROLE',
  /** La cantidad solicitada no es mayor a la contratada vigente (no es un aumento) */
  CHANGE_NOT_AN_INCREASE: 'PLT.SUB.CHANGE_NOT_AN_INCREASE',
  /** La suscripción cambió entre el cálculo y el registro del cambio */
  CHANGE_CONFLICT: 'PLT.SUB.CHANGE_CONFLICT',
  /** La cantidad pedida no es menor a la contratada vigente (operación solo de reducción) */
  CHANGE_NOT_A_DECREASE: 'PLT.SUB.CHANGE_NOT_A_DECREASE',
  /** No existe un cambio de suscripción vivo que cancelar */
  NO_LIVE_CHANGE: 'PLT.SUB.NO_LIVE_CHANGE',
  /**
   * El cambio de plan se rechaza porque el código congelado en la
   * suscripción es de tipo `unit_price` (fija el precio por empleado) y
   * todavía tiene periodos de beneficio por consumir (USRH1787714804406
   * §4.1, decisión cerrada por Wilvardo). Conservarlo al mover a un plan
   * más caro entregaría ese plan al precio pactado del barato. Se levanta
   * solo cuando el beneficio se agota.
   */
  PLAN_CHANGE_UNIT_PRICE_CODE: 'PLT.SUB.PLAN_CHANGE_UNIT_PRICE_CODE',
} as const

export type BillingSubscriptionErrorCode =
  (typeof BILLING_SUBSCRIPTION_ERROR_CODES)[keyof typeof BILLING_SUBSCRIPTION_ERROR_CODES]

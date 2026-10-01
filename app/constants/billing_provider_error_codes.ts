/**
 * Códigos estables — proveedor de cobro de suscripción (USRH1790708507467, USRH1790708507496).
 * Prefijo PLT.PRV = PLaTaforma · PRoVider.
 */
export const BILLING_PROVIDER_ERROR_CODES = {
  /** Clave de proveedor sin adaptador registrado (fail-closed, sin fallback a manual) */
  ADAPTER_NOT_REGISTERED: 'PLT.PRV.ADAPTER_NOT_REGISTERED',
  /** Operación del puerto aún no implementada para el proveedor del registro */
  OPERATION_NOT_AVAILABLE: 'PLT.PRV.OPERATION_NOT_AVAILABLE',
  /** Stripe deshabilitado o sin llaves válidas en el entorno */
  STRIPE_NOT_CONFIGURED: 'PLT.PRV.STRIPE_NOT_CONFIGURED',
} as const

export type BillingProviderErrorCode =
  (typeof BILLING_PROVIDER_ERROR_CODES)[keyof typeof BILLING_PROVIDER_ERROR_CODES]

/** Texto fijo expuesto al cliente cuando no hay adaptador (SEC-01-8). */
export const BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL =
  'El proveedor de cobro de este registro no está disponible en el sistema. Contacta a soporte.'

/** Texto fijo cuando la operación del proveedor aún no está disponible (USRH1790708507496). */
export const BILLING_PROVIDER_OPERATION_NOT_AVAILABLE_DETAIL =
  'Esta operación todavía no está disponible para el proveedor de cobro de este registro.'

/** Texto fijo cuando Stripe no está configurado en el entorno (USRH1790708507496). */
export const BILLING_PROVIDER_STRIPE_NOT_CONFIGURED_DETAIL =
  'El cobro con Stripe no está configurado en este entorno.'

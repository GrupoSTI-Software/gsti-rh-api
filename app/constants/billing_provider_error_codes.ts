/**
 * Códigos estables — proveedor de cobro de suscripción (USRH1790708507467).
 * Prefijo PLT.PRV = PLaTaforma · PRoVider.
 */
export const BILLING_PROVIDER_ERROR_CODES = {
  /** Clave de proveedor sin adaptador registrado (fail-closed, sin fallback a manual) */
  ADAPTER_NOT_REGISTERED: 'PLT.PRV.ADAPTER_NOT_REGISTERED',
} as const

export type BillingProviderErrorCode =
  (typeof BILLING_PROVIDER_ERROR_CODES)[keyof typeof BILLING_PROVIDER_ERROR_CODES]

/** Texto fijo expuesto al cliente cuando no hay adaptador (SEC-01-8). */
export const BILLING_PROVIDER_ADAPTER_NOT_REGISTERED_DETAIL =
  'El proveedor de cobro de este registro no está disponible en el sistema. Contacta a soporte.'

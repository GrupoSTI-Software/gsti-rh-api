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
  /** Stripe rechazó la operación o no respondió (USRH1790708507553) */
  PROVIDER_REQUEST_FAILED: 'PLT.PRV.PROVIDER_REQUEST_FAILED',
  /** Firma del webhook ausente, inválida o fuera de tolerancia (USRH1790708507579) */
  WEBHOOK_SIGNATURE_INVALID: 'PLT.PRV.WEBHOOK_SIGNATURE_INVALID',
  /** livemode del evento distinto al modo del adaptador (USRH1790708507579) */
  WEBHOOK_MODE_MISMATCH: 'PLT.PRV.WEBHOOK_MODE_MISMATCH',
  /** El manejador falló; Stripe debe reintentar (USRH1790708507579) */
  WEBHOOK_PROCESSING_FAILED: 'PLT.PRV.WEBHOOK_PROCESSING_FAILED',
  /** Credencial del borrador rechazada en preparar tarjeta (USRH1790718243123) */
  CARD_SETUP_UNAUTHORIZED: 'PLT.PRV.CARD_SETUP_UNAUTHORIZED',
  /** Tarjeta no confirmada al completar registro con Stripe (USRH1790708507607) */
  CARD_NOT_CONFIRMED: 'PLT.PRV.CARD_NOT_CONFIRMED',
  /** Precio o fin de prueba distintos a lo inscrito en Stripe (USRH1790708507607) */
  SUBSCRIPTION_OPENING_MISMATCH: 'PLT.PRV.SUBSCRIPTION_OPENING_MISMATCH',
  /** Otro complete del mismo borrador en curso (USRH1790708507607) */
  SIGNUP_COMPLETION_IN_PROGRESS: 'PLT.PRV.SIGNUP_COMPLETION_IN_PROGRESS',
  /** No se pudo determinar el monto del ciclo desde la suscripción (USRH1790708507665) */
  INVOICE_AMOUNT_UNAVAILABLE: 'PLT.PRV.INVOICE_AMOUNT_UNAVAILABLE',
  /** Factura con conceptos, moneda o total ajenos a Valanserh (USRH1790708507665) */
  INVOICE_UNEXPECTED_LINES: 'PLT.PRV.INVOICE_UNEXPECTED_LINES',
  /** Factura no ligada a una suscripción stripe registrada (USRH1790708507665) */
  INVOICE_SUBSCRIPTION_NOT_FOUND: 'PLT.PRV.INVOICE_SUBSCRIPTION_NOT_FOUND',
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

/** Texto fijo cuando Stripe no completa la operación (USRH1790708507553). */
export const BILLING_PROVIDER_PROVIDER_REQUEST_FAILED_DETAIL =
  'El proveedor de cobro no pudo completar la operación. Intenta de nuevo.'

/** Texto fijo cuando la firma del webhook no es válida (USRH1790708507579). */
export const BILLING_PROVIDER_WEBHOOK_SIGNATURE_INVALID_DETAIL =
  'El aviso no trae una firma válida del proveedor de cobro.'

/** Texto fijo cuando el modo del evento no coincide con el ambiente (USRH1790708507579). */
export const BILLING_PROVIDER_WEBHOOK_MODE_MISMATCH_DETAIL =
  'El aviso corresponde a un modo del proveedor de cobro distinto al de este entorno.'

/** Texto fijo hacia Stripe cuando el procesamiento falló (USRH1790708507579). */
export const BILLING_PROVIDER_WEBHOOK_PROCESSING_FAILED_DETAIL =
  'El aviso del proveedor de cobro no se pudo procesar. Se reintentará.'

/** Texto fijo cuando falta tarjeta confirmada en complete (USRH1790708507607). */
export const BILLING_PROVIDER_CARD_NOT_CONFIRMED_DETAIL =
  'Confirma tu tarjeta en el paso de pago para completar el registro.'

/** Texto fijo cuando el snapshot de apertura no coincide (USRH1790708507607). */
export const BILLING_PROVIDER_SUBSCRIPTION_OPENING_MISMATCH_DETAIL =
  'No fue posible abrir la suscripción con el proveedor de cobro. Intenta de nuevo.'

/** Texto fijo cuando otro complete reclamó el borrador (USRH1790708507607). */
export const BILLING_PROVIDER_SIGNUP_COMPLETION_IN_PROGRESS_DETAIL =
  'Tu registro ya se está completando. Espera un momento y vuelve a intentar.'

/** Texto fijo cuando no hay monto de ciclo determinable (USRH1790708507665). */
export const BILLING_PROVIDER_INVOICE_AMOUNT_UNAVAILABLE_DETAIL =
  'No fue posible determinar el monto del ciclo desde el trato de la suscripción.'

/** Texto fijo cuando la factura trae conceptos ajenos (USRH1790708507665). */
export const BILLING_PROVIDER_INVOICE_UNEXPECTED_LINES_DETAIL =
  'La factura del proveedor trae conceptos, moneda o total que no calculó Valanserh.'

/** Texto fijo cuando la factura no corresponde a una suscripción registrada (USRH1790708507665). */
export const BILLING_PROVIDER_INVOICE_SUBSCRIPTION_NOT_FOUND_DETAIL =
  'La factura del proveedor no corresponde a una suscripción registrada.'

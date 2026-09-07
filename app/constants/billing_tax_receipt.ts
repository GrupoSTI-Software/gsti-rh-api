/**
 * Valores de dominio del comprobante fiscal de membresía (USRH1788288461952).
 * La rebanada 3 ampliará este archivo con topes y perfil de archivos.
 */
export const BILLING_TAX_RECEIPT_STATUSES = ['issued', 'cancelled', 'substituted'] as const

export const BILLING_TAX_RECEIPT_LIVE_STATUS = 'issued' as const

export const BILLING_TAX_RECEIPT_DEFAULT_ISSUER = 'odoo'

export const BILLING_TAX_RECEIPT_UUID_LENGTH = 36

/** Forma canónica del folio fiscal. No usar `vine.uuid()`: acepta cualquier versión. */
export const BILLING_TAX_RECEIPT_UUID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

/** Holgura de reloj para `stampedAt` no futuro. */
export const BILLING_TAX_RECEIPT_STAMPED_AT_CLOCK_SKEW_MINUTES = 5

/** UNIQUE global del folio fiscal, incluidos cancelados. */
export const BILLING_TAX_RECEIPT_UUID_UNIQUE = 'billing_tax_receipts_uuid_unique'

/** UNIQUE de un comprobante vivo por pago (columna generada `is_live`). */
export const BILLING_TAX_RECEIPT_PAYMENT_LIVE_UNIQUE = 'billing_tax_receipts_payment_live_unique'

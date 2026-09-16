/**
 * Valores de dominio del comprobante fiscal de membresía.
 * USRH1788288461952 creó el archivo; USRH1788288461975 añade topes y perfil.
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

/** Perfil de intake del acuse. Único que acepta XML, y solo por perfil. */
export const BILLING_TAX_RECEIPT_INTAKE_PROFILE = 'tax-receipt-document' as const

/** Carpeta lógica bajo la que `uploadPrivateBuffer` antepone `{AWS_ROOT_PATH}files/`. */
export const BILLING_TAX_RECEIPT_S3_FOLDER = 'billing/tax-receipts'

/** Tope propio del XML, comprobado antes del intake. El perfil topa a 5 MB (PDF). */
export const BILLING_TAX_RECEIPT_XML_MAX_BYTES = 1024 * 1024

/**
 * El XML se sube opaco para forzar descarga y no ejecución inline en el
 * origen del bucket. El MIME real va a `billing_tax_receipt_xml_mime`.
 */
export const BILLING_TAX_RECEIPT_XML_UPLOAD_CONTENT_TYPE = 'application/octet-stream'

export const BILLING_TAX_RECEIPT_FILE_TYPES = ['xml', 'pdf'] as const

export type BillingTaxReceiptFileType = (typeof BILLING_TAX_RECEIPT_FILE_TYPES)[number]

/**
 * Caducidad del enlace firmado. Explícita siempre: el default de
 * `getDownloadLink` es 24 h. Estos archivos llevan el RFC del receptor.
 */
export const BILLING_TAX_RECEIPT_SIGNED_URL_EXPIRES_SECONDS = 5 * 60

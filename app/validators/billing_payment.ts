import vine from '@vinejs/vine'

/** Tope máximo de comprobante: 10 MB */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

/** Tipos MIME permitidos para el comprobante */
export const RECEIPT_ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const

/**
 * Query params para `GET /api/platform/billing/subscriptions/:id/payments`.
 * page y limit son opcionales; por defecto page=1, limit=20.
 */
export const listBillingPaymentsValidator = vine.compile(
  vine.object({
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)

/**
 * Body multipart para `POST /api/platform/billing/subscriptions/:id/payments`.
 *
 * El cliente envía el monto en centavos (amountCents); el avance del periodo
 * y la validación del monto contra el trato congelado son server-side.
 * El cliente NUNCA envía fechas de periodo ni el precio de referencia.
 */
export const registerBillingPaymentValidator = vine.compile(
  vine.object({
    /** Monto pagado en centavos (ej. 927800 = $9,278.00 MXN). Entero positivo. */
    amountCents: vine.number().positive().withoutDecimals(),
    /** Método de pago: transferencia, efectivo u otro. */
    method: vine.enum(['transfer', 'cash', 'other'] as const),
    /** Folio de transferencia, nota o referencia (opcional). */
    reference: vine.string().maxLength(191).optional().nullable(),
    /** Fecha del pago (ISO 8601). */
    paidAt: vine.string(),
  })
)

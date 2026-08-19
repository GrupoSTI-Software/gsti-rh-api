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
 * El monto del flujo normal lo gobierna el servidor desde
 * `billing_subscription_contracted_total` (USRH1785962095095): `amountCents`
 * ya no es obligatorio y, si se envía sin `allowCustomAmount`, solo se admite
 * si coincide con el monto gobernado. La capacidad de importe distinto es
 * explícita (`allowCustomAmount: true`) y ahí sí exige `amountCents` dentro
 * de las cotas server-side. El cliente NUNCA envía fechas de periodo ni el
 * precio de referencia; esa validación y el avance del periodo son
 * server-side.
 */
export const registerBillingPaymentValidator = vine.compile(
  vine.object({
    /** Monto pagado en centavos (ej. 927800 = $9,278.00 MXN). Opcional salvo con allowCustomAmount. */
    amountCents: vine.number().positive().withoutDecimals().optional(),
    /** Capacidad explícita de importe distinto al monto gobernado del periodo. Default false. */
    allowCustomAmount: vine.boolean().optional(),
    /** Método de pago: transferencia, efectivo u otro. */
    method: vine.enum(['transfer', 'cash', 'other'] as const),
    /** Folio de transferencia, nota o referencia (opcional). */
    reference: vine.string().maxLength(191).optional().nullable(),
    /** Fecha del pago (ISO 8601). */
    paidAt: vine.string(),
  })
)

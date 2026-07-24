import vine from '@vinejs/vine'

/**
 * Body para `POST /api/platform/billing/subscriptions` (spec §8/§9).
 * El precio, el descuento y los importes NUNCA los envía el cliente: se
 * resuelven y congelan server-side desde el catálogo.
 */
export const createBillingSubscriptionValidator = vine.compile(
  vine.object({
    businessUnitPublicId: vine.string().uuid(),
    billingPlanId: vine.number().positive().withoutDecimals(),
    /** Opcional: si se omite, se prellena con el conteo real de empleados activos. */
    contractedEmployees: vine.number().min(1).withoutDecimals().optional(),
  })
)

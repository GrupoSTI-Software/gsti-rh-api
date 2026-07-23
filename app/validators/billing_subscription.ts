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

/**
 * Body para `POST /api/platform/billing/subscriptions/:id/change-plan`.
 * El precio/descuento/importes se resuelven y recongelan server-side.
 */
export const changePlanValidator = vine.compile(
  vine.object({
    billingPlanId: vine.number().positive().withoutDecimals(),
  })
)

/**
 * Body para `POST /api/platform/billing/subscriptions/:id/cancel`.
 * No requiere cuerpo; se acepta un objeto vacío para tolerancia del cliente.
 */
export const cancelSubscriptionValidator = vine.compile(vine.object({}))

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
    /**
     * Instrucción explícita de reemplazo (USRH1785962095087). Ausente o
     * `false`: comportamiento idéntico al actual, incluido el 409 si la
     * empresa ya tiene una contratación viva.
     */
    replaceLiveSubscription: vine.boolean().optional(),
    /**
     * Texto del código de descuento a canjear (USRH1787714804401 §11.3).
     * Opcional; solo se valida forma aquí. Existencia, canjeabilidad y
     * normalización a MAYÚSCULAS las resuelve `assertRedeemableCode`, no
     * este validador: un texto inexistente es 404 de dominio, no 422 de forma.
     */
    discountCode: vine.string().trim().minLength(3).maxLength(40).optional(),
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

/**
 * Query para `GET /api/platform/billing/subscriptions` (USRH1785962095092).
 * Todos los criterios son opcionales y se combinan con AND. La validación
 * cruzada de rangos (min ≤ max, from ≤ to) se resuelve en el servicio porque
 * VineJS no ofrece una regla inclusiva de comparación entre dos campos.
 */
export const listBillingSubscriptionsValidator = vine.compile(
  vine.object({
    search: vine.string().trim().optional(),
    status: vine.enum(['trialing', 'active', 'past_due', 'canceled'] as const).optional(),
    billingPlanId: vine.number().positive().withoutDecimals().optional(),
    minEmployees: vine.number().min(0).withoutDecimals().optional(),
    maxEmployees: vine.number().min(0).withoutDecimals().optional(),
    minTotal: vine.number().min(0).optional(),
    maxTotal: vine.number().min(0).optional(),
    trialEndsFrom: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    trialEndsTo: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)

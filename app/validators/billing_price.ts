import vine from '@vinejs/vine'

/** Body para `POST /api/platform/billing/plans/:planId/prices`. */
export const createBillingPriceValidator = vine.compile(
  vine.object({
    billingPlanPriceAmount: vine.number().positive().min(0.01),
    billingPlanPriceCurrency: vine
      .string()
      .trim()
      .fixedLength(3)
      .optional(),
    billingPlanPriceTaxRate: vine.number().min(0).max(1).optional(),
    billingPlanPriceTrialDays: vine.number().min(0).withoutDecimals().optional(),
    billingPlanPriceEffectiveFrom: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    billingPlanPriceStripePriceId: vine.string().trim().maxLength(120).optional().nullable(),
    billingPlanPriceProvider: vine.string().trim().maxLength(20).optional(),
  })
)

import vine from '@vinejs/vine'

/** Body para `POST /api/platform/billing/plans`. */
export const createBillingPlanValidator = vine.compile(
  vine.object({
    billingPlanName: vine.string().trim().minLength(1).maxLength(120),
    billingPlanDescription: vine.string().trim().maxLength(255).optional().nullable(),
    billingPlanProvider: vine.string().trim().maxLength(20).optional(),
    billingPlanStripeProductId: vine.string().trim().maxLength(120).optional().nullable(),
  })
)

/** Body para `PATCH /api/platform/billing/plans/:planId`. */
export const updateBillingPlanValidator = vine.compile(
  vine.object({
    billingPlanName: vine.string().trim().minLength(1).maxLength(120).optional(),
    billingPlanDescription: vine.string().trim().maxLength(255).optional().nullable(),
    billingPlanStripeProductId: vine.string().trim().maxLength(120).optional().nullable(),
    billingPlanActive: vine.number().min(0).max(1).optional(),
  })
)

/** Query para `GET /api/platform/billing/plans/:planId/resolved-price`. */
export const resolvedPriceQueryValidator = vine.compile(
  vine.object({
    employeeCount: vine.number().min(1).withoutDecimals(),
    referenceDate: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
)

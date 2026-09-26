import vine from '@vinejs/vine'

/** Body para `POST /api/platform/billing/plans/:planId/tiers`. */
export const createBillingTierValidator = vine.compile(
  vine.object({
    billingVolumeTierMinEmployees: vine.number().min(1).withoutDecimals(),
    billingVolumeTierDiscountPercent: vine.number().min(0).max(100),
  })
)

/** Body para `PATCH /api/platform/billing/plans/:planId/tiers/:tierId`. */
export const updateBillingTierValidator = vine.compile(
  vine.object({
    billingVolumeTierMinEmployees: vine.number().min(1).withoutDecimals().optional(),
    billingVolumeTierDiscountPercent: vine.number().min(0).max(100).optional(),
  })
)

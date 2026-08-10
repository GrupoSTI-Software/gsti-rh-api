import vine from '@vinejs/vine'

/**
 * Query para `GET /api/signup/plans/:planId/price`.
 *
 * Solo valida la forma del parámetro `employees` (entero positivo).
 * La regla comercial de bloques de 10 vive en `BillingTenantService.assertContractedEmployees`.
 */
export const publicPlanPriceQueryValidator = vine.compile(
  vine.object({
    employees: vine.number().positive().withoutDecimals(),
  })
)

/**
 * Body para `POST /api/billing/subscription` (re-contratación tenant).
 * Solo valida forma; las reglas comerciales viven en `BillingTenantService`.
 */
export const contractTenantSubscriptionValidator = vine.compile(
  vine.object({
    billingPlanId: vine.number().positive().withoutDecimals(),
    contractedEmployees: vine.number().positive().withoutDecimals(),
  })
)

/**
 * Query para `GET /api/billing/subscription/change-preview`.
 * Solo valida la forma; las reglas comerciales viven en
 * `BillingSubscriptionChangeService` y en `BillingTenantService`.
 */
export const previewSubscriptionChangeQueryValidator = vine.compile(
  vine.object({
    employees: vine.number().positive().withoutDecimals(),
  })
)

/**
 * Body para `POST /api/billing/subscription/changes/increase` (USRH1786107870850).
 * Solo valida forma; las reglas comerciales y el cálculo viven en
 * `BillingSubscriptionChangeService`.
 */
export const requestSubscriptionIncreaseValidator = vine.compile(
  vine.object({
    employees: vine.number().positive().withoutDecimals(),
  })
)

/**
 * Body para `POST /api/billing/subscription/changes/decrease` (USRH1786107870853).
 * Solo valida forma; las reglas comerciales viven en
 * `BillingSubscriptionChangeService` y en `BillingTenantService`.
 */
export const scheduleSubscriptionDecreaseValidator = vine.compile(
  vine.object({
    employees: vine.number().positive().withoutDecimals(),
  })
)

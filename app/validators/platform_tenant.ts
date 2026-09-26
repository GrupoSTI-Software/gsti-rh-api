import vine from '@vinejs/vine'

export const TENANT_SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'canceled',
] as const

/**
 * Body para `PUT /api/platform/tenants/:id/biometrics`.
 * Enciende o apaga la marca de biométricos en sitio de la empresa.
 */
export const updateTenantBiometricsValidator = vine.compile(
  vine.object({
    enabled: vine.boolean(),
  })
)

/**
 * Query params para `GET /api/platform/tenants`.
 */
export const listTenantsValidator = vine.compile(
  vine.object({
    search: vine.string().trim().minLength(1).maxLength(191).optional(),
    status: vine.enum(TENANT_SUBSCRIPTION_STATUSES).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)

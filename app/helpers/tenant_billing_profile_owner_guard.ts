import type { HttpContext } from '@adonisjs/core/http'
import { BILLING_OWNER_SLUGS } from '#helpers/billing_owner_guard'
import { tenantBillingForbiddenRoleError } from '#helpers/tenant_billing_profile_error'

/**
 * Solo el dueño de la cuenta (y roles internos equivalentes) puede consultar o guardar
 * el perfil de facturación del tenant (USRH1786737531057, regla 8).
 */
export async function assertTenantBillingOwner(ctx: HttpContext): Promise<void> {
  const user = ctx.auth.user!
  await user.preload('role')
  const roleSlug = user.role?.roleSlug

  if (!roleSlug || !BILLING_OWNER_SLUGS.includes(roleSlug as (typeof BILLING_OWNER_SLUGS)[number])) {
    throw tenantBillingForbiddenRoleError()
  }
}

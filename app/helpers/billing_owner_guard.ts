import type { HttpContext } from '@adonisjs/core/http'
import { onlyAccountOwnerError } from './billing_tenant_error.js'

/** Slugs que pueden consultar decisiones de dinero de la suscripción (regla 14). */
export const BILLING_OWNER_SLUGS = ['owner', 'root', 'super-administrador'] as const

/**
 * Solo el dueño de la cuenta consulta el costo del cambio de suscripción (USRH1786107870847).
 * `root` y `super-administrador` pasan, como en el resto del repo.
 */
export async function assertBillingOwner(ctx: HttpContext): Promise<void> {
  const user = ctx.auth.user!
  await user.preload('role')
  const roleSlug = user.role?.roleSlug

  if (!roleSlug || !BILLING_OWNER_SLUGS.includes(roleSlug as (typeof BILLING_OWNER_SLUGS)[number])) {
    throw onlyAccountOwnerError()
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import { onlyAccountOwnerError } from './billing_tenant_error.js'
import { forbiddenRoleError } from './business_unit_signup_errors.js'

/** Slugs que pueden consultar decisiones de dinero de la suscripción (regla 14). */
export const BILLING_OWNER_SLUGS = ['owner', 'root', 'super-administrador'] as const

/** Devuelve `true` si el slug del rol puede operar sobre recursos de billing del owner. */
export function isBillingOwnerSlug(roleSlug: string | undefined): boolean {
  return !!roleSlug && BILLING_OWNER_SLUGS.includes(roleSlug as (typeof BILLING_OWNER_SLUGS)[number])
}

/**
 * Solo el dueño de la cuenta consulta el costo del cambio de suscripción (USRH1786107870847).
 * `root` y `super-administrador` pasan, como en el resto del repo.
 */
export async function assertBillingOwner(ctx: HttpContext): Promise<void> {
  const user = ctx.auth.user!
  await user.preload('role')

  if (!isBillingOwnerSlug(user.role?.roleSlug)) {
    throw onlyAccountOwnerError()
  }
}

/**
 * Guard del alta de empresa adicional (USRH1787932877001, CA-5).
 *
 * Mismos slugs permitidos que `assertBillingOwner`; código de error
 * diferente (`TNT.BU.FORBIDDEN_ROLE` en vez de `PLT.SUB.FORBIDDEN_ROLE`)
 * para que el cliente distinga el origen del rechazo.
 */
export async function assertAdditionalBusinessUnitOwner(ctx: HttpContext): Promise<void> {
  const user = ctx.auth.user!
  await user.preload('role')

  if (!isBillingOwnerSlug(user.role?.roleSlug)) {
    throw forbiddenRoleError()
  }
}

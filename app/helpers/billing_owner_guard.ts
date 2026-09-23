import type { HttpContext } from '@adonisjs/core/http'
import type { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
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
 *
 * @param buildError - Negativa a lanzar; por defecto la del cambio de suscripción.
 *   La contratación pasa la suya para que el `detail` describa lo que se intentó.
 * @throws BillingSubscriptionServiceError 403 si el rol no es de dueño.
 */
export async function assertBillingOwner(
  ctx: HttpContext,
  buildError: () => BillingSubscriptionServiceError = onlyAccountOwnerError
): Promise<void> {
  const user = ctx.auth.user!
  await user.preload('role')

  if (!isBillingOwnerSlug(user.role?.roleSlug)) {
    throw buildError()
  }
}

/**
 * Igual que `assertBillingOwner`, pero responde en vez de lanzar.
 *
 * La consume la única lectura que no puede negarse —el estado de la
 * contratación, que el backoffice consulta en cada navegación— para decidir
 * cuánto de la suscripción devuelve: todo al dueño, lo imprescindible al resto
 * (`restrictMySubscription`).
 */
export async function isBillingOwnerRequest(ctx: HttpContext): Promise<boolean> {
  const user = ctx.auth.user
  if (!user) {
    return false
  }

  await user.preload('role')

  return isBillingOwnerSlug(user.role?.roleSlug)
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

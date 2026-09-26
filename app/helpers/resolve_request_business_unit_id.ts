import type { HttpContext } from '@adonisjs/core/http'
import BusinessAccessScopeService from '#services/business_access_scope_service'

/** Header que el cliente envía para seleccionar la unidad de negocio activa. */
const BUSINESS_UNIT_HEADER = 'x-business-unit-id'

/**
 * Resuelve el id interno de la unidad de negocio del usuario autenticado a
 * partir del header `X-Business-Unit-Id`, para rutas que tienen `auth()`
 * pero NO `businessScope()` (por lo que `ctx.businessUnitScope`/`TenantContext`
 * no están disponibles) — ver USRH1783712837584 §3/§11.
 *
 * Uso puntual y local al handler: no activa `TenantContext.run()` ni el mixin
 * `withBusinessUnitScope`, así que no afecta otras queries del mismo request
 * (a diferencia de agregar el middleware `businessScope` a la ruta completa).
 *
 * Devuelve `null` si falta el header, el usuario no está autenticado, o el
 * valor no resuelve a una unidad dentro del scope del usuario — el llamador
 * decide cómo tratar ese caso (p. ej. conservar un fallback de branding).
 */
export async function resolveRequestBusinessUnitId(ctx: HttpContext): Promise<number | null> {
  const headerValue = ctx.request.header(BUSINESS_UNIT_HEADER)
  const user = ctx.auth.user
  if (!headerValue || !user) return null

  if (!user.role) {
    await user.load('role')
  }

  const scopeService = new BusinessAccessScopeService()
  const fullScope = await scopeService.getAccessibleIds(user)
  return scopeService.resolveInternalId(headerValue, fullScope)
}

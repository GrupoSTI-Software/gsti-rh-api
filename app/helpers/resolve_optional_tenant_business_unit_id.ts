import type { HttpContext } from '@adonisjs/core/http'
import BusinessAccessScopeService from '#services/business_access_scope_service'

/** Empresa resuelta del encabezado, o el motivo por el que no se resolvió. */
export interface OptionalTenantBusinessUnit {
  /** Id interno de la empresa, o `null` si no hay encabezado o no se pudo resolver. */
  businessUnitId: number | null
  /** El encabezado traía una empresa que el usuario no alcanza. */
  notInScope?: boolean
}

/**
 * Resuelve la empresa del encabezado `x-business-unit-id` para rutas que
 * montan `auth()` pero NO `businessScope()`.
 *
 * Existe porque el backoffice inyecta ese encabezado en toda llamada al API
 * (interceptor global) y varias lecturas de arranque necesitan la empresa sin
 * que el grupo de rutas imponga el middleware de scope. Sin esto, el call site
 * cae a `SystemSettingService.getActive()` sin argumentos, que en multitenant
 * devuelve SIEMPRE la ficha base (`business_unit_id` NULL) y no la de quien
 * pide.
 *
 * Fail-closed: sin encabezado, sin sesión o con una empresa fuera del alcance
 * del usuario devuelve `businessUnitId: null` — nunca la empresa de otro. El
 * call site decide qué hacer con cada caso.
 */
export async function resolveOptionalTenantBusinessUnitId(
  ctx: HttpContext
): Promise<OptionalTenantBusinessUnit> {
  const headerValue = ctx.request.header('x-business-unit-id')
  if (!headerValue) return { businessUnitId: null }

  let authenticated = false
  try {
    authenticated = await ctx.auth.check()
  } catch {
    authenticated = false
  }
  if (!authenticated || !ctx.auth.user) return { businessUnitId: null }

  const user = ctx.auth.user
  if (!user.role) await user.load('role')
  const scopeService = new BusinessAccessScopeService()
  const fullScope = await scopeService.getAccessibleIds(user)
  const resolvedId = await scopeService.resolveInternalId(headerValue, fullScope)
  if (resolvedId === null) return { businessUnitId: null, notInScope: true }
  return { businessUnitId: resolvedId }
}

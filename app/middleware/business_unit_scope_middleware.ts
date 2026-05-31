import type { NextFn } from '@adonisjs/core/types/http'
import type { HttpContext } from '@adonisjs/core/http'
import BusinessAccessScopeService from '#services/business_access_scope_service'

/**
 * Resuelve una vez por request los IDs de unidades de negocio accesibles
 * para el usuario autenticado y los expone en `ctx.businessUnitScope`.
 *
 * Debe colocarse después del middleware `auth` (requiere usuario autenticado).
 *
 * Uso en rutas:
 *   router.get('/employees', [...]).use(middleware.auth()).use(middleware.businessScope())
 *
 * Uso en controllers / services:
 *   const ids = ctx.businessUnitScope  // number[]
 */
export default class BusinessUnitScopeMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user!

    const scopeService = new BusinessAccessScopeService()
    ctx.businessUnitScope = await scopeService.getAccessibleIds(user)

    return next()
  }
}

/**
 * Extensión del HttpContext para exponer el scope de business units
 * resuelto una única vez por request.
 */
declare module '@adonisjs/core/http' {
  export interface HttpContext {
    businessUnitScope: number[]
  }
}

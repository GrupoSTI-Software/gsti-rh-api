import type { NextFn } from '@adonisjs/core/types/http'
import type { HttpContext } from '@adonisjs/core/http'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import { TenantContext } from '#utils/tenant_context'

/** Nombre del header que permite al cliente seleccionar una unidad de negocio específica. */
const BUSINESS_UNIT_HEADER = 'x-business-unit-id'

/**
 * Resuelve una vez por request los IDs de unidades de negocio accesibles
 * para el usuario autenticado y los expone en dos lugares:
 *
 *  1. `ctx.businessUnitScope` — para controllers y servicios que leen el scope
 *     explícitamente (compatibilidad con código existente).
 *  2. `TenantContext` (AsyncLocalStorage) — para el mixin `withBusinessUnitScope`,
 *     que inyecta el filtro automáticamente en todas las queries de los modelos
 *     tenant-scoped a lo largo de toda la cadena async de la request.
 *
 * ## Header opcional `X-Business-Unit-Id`
 * Si el cliente envía este header, el middleware valida que el ID solicitado
 * pertenezca al scope accesible del usuario:
 *  - No pertenece → 404 (el recurso no existe para ese usuario).
 *  - Pertenece     → el scope se estrecha a ese único ID para toda la request.
 *
 * ## Comportamiento por rol (sin header o con header válido)
 *  - root → `TenantContext.runUnscoped`: el mixin omite el whereIn (acceso total).
 *  - resto → `TenantContext.run(scope)`: el mixin aplica whereIn con los IDs resueltos.
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

    if (!user.role) {
      await user.load('role')
    }

    const scopeService = new BusinessAccessScopeService()
    const fullScope = await scopeService.getAccessibleIds(user)

    // Validar header X-Business-Unit-Id si viene en la request
    const headerValue = ctx.request.header(BUSINESS_UNIT_HEADER)
    let effectiveScope = fullScope

    if (headerValue !== undefined) {
      const requestedId = Number(headerValue)

      if (!Number.isInteger(requestedId) || requestedId <= 0) {
        return ctx.response.status(400).json({
          message: `El header ${BUSINESS_UNIT_HEADER} debe ser un entero positivo.`,
        })
      }

      const isAllowed =
        user.role?.roleSlug === 'root' || fullScope.includes(requestedId)

      if (!isAllowed) {
        return ctx.response.status(404).json({
          message: 'Unidad de negocio no encontrada.',
        })
      }

      effectiveScope = [requestedId]
    }

    // Validar businessUnitId enviado como query param
    const queryBusinessUnitId = ctx.request.qs().businessUnitId
      ? Number(ctx.request.qs().businessUnitId)
      : undefined

    if (
      queryBusinessUnitId !== undefined &&
      user.role?.roleSlug !== 'root' &&
      !fullScope.includes(queryBusinessUnitId)
    ) {
      return ctx.response.status(404).json({
        message: 'Unidad de negocio no encontrada.',
      })
    }

    ctx.businessUnitScope = effectiveScope

    if (user.role?.roleSlug === 'root') {
      return TenantContext.runUnscoped(() => next(), 'usuario con rol root')
    }

    return TenantContext.run(effectiveScope, () => next())
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

import type { NextFn } from '@adonisjs/core/types/http'
import type { HttpContext } from '@adonisjs/core/http'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import { TenantContext } from '#utils/tenant_context'

/** Header que el cliente envía para seleccionar la unidad de negocio activa. */
const BUSINESS_UNIT_HEADER = 'x-business-unit-id'

/** Códigos de error del middleware de scope (contrato GSTI). */
const ERR = {
  /**
   * El código público es inexistente o fuera del alcance del usuario.
   * No se distingue entre "formato inválido" y "no en scope" para evitar
   * filtrar información sobre la existencia de unidades.
   */
  NOT_IN_SCOPE: { key: 'BU.NOT.001', title: 'Unidad de negocio no encontrada' },
} as const

/**
 * Variante de `BusinessUnitScopeMiddleware` donde el header `X-Business-Unit-Id`
 * es **opcional**.
 *
 * Usar en rutas bootstrap que se ejecutan antes de que el cliente conozca la
 * unidad activa (p. ej. catálogo de unidades de negocio, permisos iniciales).
 *
 * Comportamiento:
 *  - Sin header → `ctx.businessUnitScope` = conjunto completo accesible del usuario;
 *                 `TenantContext.run(fullScope)` (sin narrowing).
 *  - Con header → UUID v4 del código público de la unidad; se resuelve al ID
 *                 interno y se estrecha el scope a `[internalId]`.
 *                 UUID inválido o fuera de scope → 404 `BU.NOT.001`.
 *
 * Debe colocarse después del middleware `auth` (requiere usuario autenticado).
 */
export default class BusinessUnitScopeOptionalMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user!

    if (!user.role) {
      await user.load('role')
    }

    const scopeService = new BusinessAccessScopeService()
    const fullScope = await scopeService.getAccessibleIds(user)

    // ── Header X-Business-Unit-Id (opcional) — ahora debe ser UUID v4 ────────
    const headerValue = ctx.request.header(BUSINESS_UNIT_HEADER)

    if (headerValue === undefined) {
      // Sin header → scope completo del usuario, sin narrowing.
      ctx.businessUnitScope = fullScope
      return TenantContext.run(fullScope, () => next())
    }

    const requestedId = await scopeService.resolveInternalId(headerValue, fullScope)

    if (requestedId === null) {
      return ctx.response.status(404).json({
        title: ERR.NOT_IN_SCOPE.title,
        detail: 'El recurso solicitado no existe o no tienes acceso a él.',
        key: ERR.NOT_IN_SCOPE.key,
      })
    }

    // ── Query param / body businessUnitId ────────────────────────────────────
    // Acepta dos formatos para compatibilidad progresiva:
    //  a) UUID v4 → se resuelve al ID interno y se inyecta.
    //  b) Entero positivo (legacy) → se valida en scope y se deja intacto.
    // Si está ausente, se inyecta el ID resuelto desde el header.
    const rawQueryId = ctx.request.qs().businessUnitId
    const rawBodyId = ctx.request.body().businessUnitId
    const candidateRaw = rawQueryId ?? rawBodyId

    if (candidateRaw) {
      const candidateStr = String(candidateRaw)
      const resolvedFromParam = await scopeService.resolveInternalId(candidateStr, fullScope)

      if (resolvedFromParam !== null) {
        ctx.request.updateQs({ ...ctx.request.qs(), businessUnitId: resolvedFromParam })
        ctx.request.updateBody({ ...ctx.request.body(), businessUnitId: resolvedFromParam })
      } else {
        const candidateNumber = Number(candidateRaw)
        if (!Number.isInteger(candidateNumber) || candidateNumber <= 0) {
          return ctx.response.status(404).json({
            title: ERR.NOT_IN_SCOPE.title,
            detail: 'El recurso solicitado no existe o no tienes acceso a él.',
            key: ERR.NOT_IN_SCOPE.key,
          })
        }
        if (!fullScope.includes(candidateNumber)) {
          return ctx.response.status(404).json({
            title: ERR.NOT_IN_SCOPE.title,
            detail: 'El recurso solicitado no existe o no tienes acceso a él.',
            key: ERR.NOT_IN_SCOPE.key,
          })
        }
      }
    } else {
      // Ausente, nulo o vacío → inyectar el ID interno resuelto desde el header
      ctx.request.updateQs({ ...ctx.request.qs(), businessUnitId: requestedId })
      ctx.request.updateBody({ ...ctx.request.body(), businessUnitId: requestedId })
    }

    ctx.businessUnitScope = [requestedId]

    return TenantContext.run([requestedId], () => next())
  }
}

import type { NextFn } from '@adonisjs/core/types/http'
import type { HttpContext } from '@adonisjs/core/http'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import { TenantContext } from '#utils/tenant_context'

/** Header que el cliente envía para seleccionar la unidad de negocio activa. */
const BUSINESS_UNIT_HEADER = 'x-business-unit-id'

/** Códigos de error del middleware de scope (contrato GSTI). */
const ERR = {
  /** Header o campo businessUnitId con valor no entero-positivo. */
  INVALID_ID: { key: 'BU.VAL.001', title: 'Parámetro inválido' },
  /** ID enviado no pertenece al scope accesible del usuario. */
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
 *  - Con header → idéntico a `BusinessUnitScopeMiddleware`: valida y estrecha
 *                 el scope a `[selectedId]`.
 *
 * ## root
 * Omite toda validación y continúa con `TenantContext.runUnscoped`.
 *
 * Debe colocarse después del middleware `auth` (requiere usuario autenticado).
 */
export default class BusinessUnitScopeOptionalMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user!

    if (!user.role) {
      await user.load('role')
    }

    const isRoot = user.role?.roleSlug === 'root'

    // Root omite toda validación de scope y continúa sin filtro de tenant.
    if (isRoot) {
      ctx.businessUnitScope = []
      return TenantContext.runUnscoped(() => next(), 'usuario con rol root')
    }

    const scopeService = new BusinessAccessScopeService()
    const fullScope = await scopeService.getAccessibleIds(user)

    // ── Header X-Business-Unit-Id (opcional) ─────────────────────────────────
    const headerValue = ctx.request.header(BUSINESS_UNIT_HEADER)

    if (headerValue === undefined) {
      // Sin header → scope completo del usuario, sin narrowing.
      ctx.businessUnitScope = fullScope
      return TenantContext.run(fullScope, () => next())
    }

    const requestedId = Number(headerValue)

    if (!Number.isInteger(requestedId) || requestedId <= 0) {
      return ctx.response.status(400).json({
        title: ERR.INVALID_ID.title,
        detail: `El header ${BUSINESS_UNIT_HEADER} debe ser un entero positivo.`,
        key: ERR.INVALID_ID.key,
      })
    }

    if (!fullScope.includes(requestedId)) {
      return ctx.response.status(404).json({
        title: ERR.NOT_IN_SCOPE.title,
        detail: 'El recurso solicitado no existe o no tienes acceso a él.',
        key: ERR.NOT_IN_SCOPE.key,
      })
    }

    // ── Query param / body businessUnitId ────────────────────────────────────
    const rawQueryId = ctx.request.qs().businessUnitId
    const rawBodyId = ctx.request.body().businessUnitId
    const candidateId = rawQueryId ?? rawBodyId
    const candidateNumber = candidateId ? Number(candidateId) : 0

    if (candidateNumber > 0) {
      // Viene con un valor: validar que sea entero positivo y que esté en scope.
      if (!Number.isInteger(candidateNumber)) {
        return ctx.response.status(400).json({
          title: ERR.INVALID_ID.title,
          detail: 'El campo businessUnitId debe ser un entero positivo.',
          key: ERR.INVALID_ID.key,
        })
      }

      if (!fullScope.includes(candidateNumber)) {
        return ctx.response.status(404).json({
          title: ERR.NOT_IN_SCOPE.title,
          detail: 'El recurso solicitado no existe o no tienes acceso a él.',
          key: ERR.NOT_IN_SCOPE.key,
        })
      }
    } else {
      // Ausente, nulo o 0 → sustituir por el ID que viene en el header,
      // tanto en query string como en body para que request.input() lo devuelva.
      ctx.request.updateQs({ ...ctx.request.qs(), businessUnitId: requestedId })
      ctx.request.updateBody({ ...ctx.request.body(), businessUnitId: requestedId })
    }

    ctx.businessUnitScope = [requestedId]

    return TenantContext.run([requestedId], () => next())
  }
}

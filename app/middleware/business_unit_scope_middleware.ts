import type { NextFn } from '@adonisjs/core/types/http'
import type { HttpContext } from '@adonisjs/core/http'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import { TenantContext } from '#utils/tenant_context'

/** Header que el cliente envía para seleccionar la unidad de negocio activa. */
const BUSINESS_UNIT_HEADER = 'x-business-unit-id'

/** Códigos de error del middleware de scope (contrato GSTI). */
const ERR = {
  /** Header X-Business-Unit-Id ausente (es obligatorio). */
  MISSING_HEADER: { key: 'BU.VAL.000', title: 'Header requerido' },
  /**
   * El código público es inexistente o fuera del alcance del usuario.
   * No se distingue entre "formato inválido" y "no en scope" para evitar
   * filtrar información sobre la existencia de unidades.
   */
  NOT_IN_SCOPE: { key: 'BU.NOT.001', title: 'Unidad de negocio no encontrada' },
} as const

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
 * ## Header `X-Business-Unit-Id` (obligatorio)
 * El cliente debe enviar el **código público UUID v4** en toda request. El middleware:
 *  - Ausente          → 400 `BU.VAL.000`.
 *  - UUID inválido    → 404 `BU.NOT.001` (no revela si el formato es incorrecto).
 *  - Fuera del scope  → 404 `BU.NOT.001` (no revela si la unidad existe).
 *  - Válido           → resuelve al ID interno → `TenantContext.run([internalId])`.
 *
 * ## Validación de `businessUnitId` / `payrollBusinessUnitId` en query/body
 * Para compatibilidad con el código existente, `businessUnitId` en query string
 * y body se acepta como UUID v4 o entero positivo (ID interno). Cuando está
 * ausente, se inyecta el ID interno resuelto desde el header.
 * `payrollBusinessUnitId` en body sigue la misma semántica (requerido en alta
 * de empleados como FK NOT NULL).
 *
 * Debe colocarse después del middleware `auth` (requiere usuario autenticado).
 */
export default class BusinessUnitScopeMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user!

    if (!user.role) {
      await user.load('role')
    }

    const scopeService = new BusinessAccessScopeService()
    const fullScope = await scopeService.getAccessibleIds(user)

    // ── Header X-Business-Unit-Id (obligatorio) — ahora debe ser UUID v4 ────
    const headerValue = ctx.request.header(BUSINESS_UNIT_HEADER)

    if (headerValue === undefined) {
      return ctx.response.status(400).json({
        title: ERR.MISSING_HEADER.title,
        detail: `El header ${BUSINESS_UNIT_HEADER} es obligatorio.`,
        key: ERR.MISSING_HEADER.key,
      })
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
    // Acepta dos formatos para compatibilidad progresiva durante la migración:
    //  a) UUID v4 (formato nuevo) → se resuelve al ID interno y se inyecta.
    //  b) Entero positivo (formato legacy) → se valida en scope y se deja intacto.
    // Si el campo está ausente, se inyecta el ID resuelto desde el header.
    const rawQueryId = ctx.request.qs().businessUnitId
    const rawBodyId = ctx.request.body().businessUnitId
    const candidateRaw = rawQueryId ?? rawBodyId

    if (candidateRaw) {
      const candidateStr = String(candidateRaw)
      const resolvedFromParam = await scopeService.resolveInternalId(candidateStr, fullScope)

      if (resolvedFromParam !== null) {
        // Era UUID válido en scope → inyectar ID interno
        ctx.request.updateQs({ ...ctx.request.qs(), businessUnitId: resolvedFromParam })
        ctx.request.updateBody({ ...ctx.request.body(), businessUnitId: resolvedFromParam })
      } else {
        // Intentar como entero (formato legacy)
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

    // ── Body payrollBusinessUnitId (misma semántica que businessUnitId) ───────
    // FK NOT NULL en employees; si llega UUID o ausente, debe resolverse al ID
    // interno. Sin esto el alta falla en verifyInfoExist con el UUID crudo.
    const rawPayrollId = ctx.request.body().payrollBusinessUnitId
    if (rawPayrollId !== undefined && rawPayrollId !== null && rawPayrollId !== '') {
      const payrollStr = String(rawPayrollId)
      const resolvedPayroll = await scopeService.resolveInternalId(payrollStr, fullScope)
      if (resolvedPayroll !== null) {
        ctx.request.updateBody({
          ...ctx.request.body(),
          payrollBusinessUnitId: resolvedPayroll,
        })
      } else {
        const payrollNumber = Number(rawPayrollId)
        if (!Number.isInteger(payrollNumber) || payrollNumber <= 0 || !fullScope.includes(payrollNumber)) {
          return ctx.response.status(404).json({
            title: ERR.NOT_IN_SCOPE.title,
            detail: 'El recurso solicitado no existe o no tienes acceso a él.',
            key: ERR.NOT_IN_SCOPE.key,
          })
        }
      }
    } else {
      ctx.request.updateBody({
        ...ctx.request.body(),
        payrollBusinessUnitId: requestedId,
      })
    }

    ctx.businessUnitScope = [requestedId]

    return TenantContext.run([requestedId], () => next())
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

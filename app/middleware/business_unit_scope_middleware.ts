import type { NextFn } from '@adonisjs/core/types/http'
import type { HttpContext } from '@adonisjs/core/http'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import { resolveLegacyCompanyIdParam } from '#helpers/resolve_legacy_company_id_param'
import { resolveBusinessUnitIdParam } from '#helpers/resolve_business_unit_id_param'
import { TenantContext } from '#utils/tenant_context'
import { runWithSensitiveReadDecisions } from '#helpers/sensitive_read_decisions'

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

    // ── Query param / body businessUnitId y payrollBusinessUnitId ───────────
    // Acepta UUID v4 o entero legacy; valida scope del usuario. Si ausente,
    // inyecta el ID resuelto desde el header.
    for (const paramName of ['businessUnitId', 'payrollBusinessUnitId'] as const) {
      const resolved = await resolveBusinessUnitIdParam(
        ctx,
        scopeService,
        fullScope,
        paramName,
        requestedId
      )
      if (resolved === 'not-in-scope') {
        return ctx.response.status(404).json({
          title: ERR.NOT_IN_SCOPE.title,
          detail: 'El recurso solicitado no existe o no tienes acceso a él.',
          key: ERR.NOT_IN_SCOPE.key,
        })
      }
    }

    // Alias legacy NOM035: `companyId` también puede llegar como UUID v4.
    const companyResolved = await resolveLegacyCompanyIdParam(ctx, scopeService, fullScope)
    if (companyResolved === 'not-in-scope') {
      return ctx.response.status(404).json({
        title: ERR.NOT_IN_SCOPE.title,
        detail: 'El recurso solicitado no existe o no tienes acceso a él.',
        key: ERR.NOT_IN_SCOPE.key,
      })
    }

    ctx.businessUnitScope = [requestedId]

    return TenantContext.run([requestedId], () => runWithSensitiveReadDecisions(ctx, next))
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

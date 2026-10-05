import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { BaseModel } from '@adonisjs/lucid/orm'
import { TenantContextMissingException } from '#exceptions/tenant_context_missing_exception'
import { HttpRequestMarker } from '#utils/http_request_marker'
import { TenantContext } from '#utils/tenant_context'
import {
  recordTenantScopeBlock,
  type TenantScopeBlockHook,
} from '#utils/tenant_scope_block_log'

export interface BusinessUnitScopeOptions {
  /**
   * Si es true, las filas con `business_unit_id` NULL se tratan como catálogo
   * del sistema y son visibles junto al scope del tenant activo.
   */
  includeGlobal?: boolean
}

export type NoContextBehavior = 'empty' | 'throw'

/**
 * Qué hace el mixin cuando la consulta llega sin contexto de empresa y sin bypass.
 */
export function noContextBehavior(insideHttpRequest: boolean): NoContextBehavior {
  return insideHttpRequest ? 'empty' : 'throw'
}

type ScopedQuery = {
  whereIn: (column: string, values: number[]) => ScopedQuery
  whereRaw: (sql: string, bindings?: unknown[]) => void
  whereNull: (column: string) => ScopedQuery
  orWhereNull: (column: string) => void
  where: (callback: (subQuery: ScopedQuery) => void) => void
  readonly model?: { readonly table: string }
}

type ApplyFilterOptions = BusinessUnitScopeOptions & {
  hook?: TenantScopeBlockHook
}

/**
 * Aplica el filtro de tenant a una query dado el contexto activo.
 *
 * Regla única: sin contexto equivale a contexto activo con alcance vacío.
 *  - Bypass → sin filtro.
 *  - Sin contexto → registro muestreado (bloqueado). Con `includeGlobal`, solo NULL.
 *    Sin `includeGlobal`: vacío en petición HTTP; `TenantContextMissingException` fuera.
 *  - Alcance vacío + activo → `1 = 0`, salvo `includeGlobal` → solo NULL.
 *  - Alcance con IDs → `whereIn`; con `includeGlobal` también NULL.
 */
function applyTenantFilter(
  query: ScopedQuery,
  column: string,
  options: ApplyFilterOptions = {}
): void {
  if (TenantContext.isBypassed()) return

  const includeGlobal = options.includeGlobal === true

  if (!TenantContext.isActive()) {
    const table = query.model?.table
    if (table && options.hook) {
      recordTenantScopeBlock({ table, hook: options.hook })
    }

    if (
      !includeGlobal &&
      noContextBehavior(HttpRequestMarker.isInHttpRequest()) === 'throw'
    ) {
      throw new TenantContextMissingException(table ?? 'desconocida', options.hook ?? 'find')
    }
  }

  const scope = TenantContext.getScope()

  if (includeGlobal) {
    if (scope.length === 0) {
      query.whereNull(column)
      return
    }

    query.where((subQuery) => {
      subQuery.whereIn(column, scope).orWhereNull(column)
    })
    return
  }

  if (scope.length === 0) {
    query.whereRaw('1 = 0')
    return
  }

  query.whereIn(column, scope)
}

/**
 * Mixin Lucid que inyecta automáticamente el filtro de tenant en toda query
 * del modelo, usando el scope resuelto en `TenantContext` (AsyncLocalStorage).
 *
 * ## Semántica de filas globales (`business_unit_id` NULL)
 * Representan catálogo del sistema, no de un tenant. Solo los modelos que pasen
 * `{ includeGlobal: true }` las incluyen en consultas con contexto activo.
 *
 * ## Cuándo se filtra
 * Siempre. Con `TenantContext.run(scope)` se filtra por ese alcance. Sin contexto
 * la consulta NO sale completa: dentro de una petición HTTP resuelve a vacío;
 * fuera de ella lanza `TenantContextMissingException`. Cada caso queda en el
 * registro muestreado de `tenant_scope_block_log`.
 *
 * ## Bypass explícito (solo vías catalogadas)
 * ```typescript
 * return TenantContext.runUnscoped(() => myQuery(), TENANT_UNSCOPED_REASON.BACKFILL_MAINTENANCE)
 * ```
 * Nunca por rol de empresa. Si una vía legítima falla tras el cambio, se declara
 * con un motivo del catálogo; jamás se reabre la regla general.
 *
 * ## No cubre (residual declarado)
 * `update()`/`delete()` masivos por query builder y Knex crudo.
 */
export function withBusinessUnitScope(
  tenantColumn: string = 'business_unit_id',
  options: BusinessUnitScopeOptions = {}
) {
  return function <T extends NormalizeConstructor<typeof BaseModel>>(superclass: T) {
    class BusinessUnitScopedModel extends superclass {
      static boot() {
        super.boot()

        this.before('find', (query: ScopedQuery) => {
          applyTenantFilter(query, tenantColumn, { ...options, hook: 'find' })
        })

        this.before('fetch', (query: ScopedQuery) => {
          applyTenantFilter(query, tenantColumn, { ...options, hook: 'fetch' })
        })

        this.before('paginate', ([countQuery, query]: ScopedQuery[]) => {
          applyTenantFilter(countQuery, tenantColumn, { ...options, hook: 'paginate' })
          applyTenantFilter(query, tenantColumn, { ...options, hook: 'paginate' })
        })
      }
    }

    return BusinessUnitScopedModel
  }
}

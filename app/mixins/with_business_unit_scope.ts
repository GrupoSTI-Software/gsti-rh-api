import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { BaseModel } from '@adonisjs/lucid/orm'
import { TenantContext } from '#utils/tenant_context'

export interface BusinessUnitScopeOptions {
  /**
   * Si es true, las filas con `business_unit_id` NULL se tratan como catálogo
   * del sistema y son visibles junto al scope del tenant activo.
   */
  includeGlobal?: boolean
}

type ScopedQuery = {
  whereIn: (column: string, values: number[]) => ScopedQuery
  whereRaw: (sql: string, bindings?: unknown[]) => void
  whereNull: (column: string) => ScopedQuery
  orWhereNull: (column: string) => void
  where: (callback: (subQuery: ScopedQuery) => void) => void
}

/**
 * Aplica el filtro de tenant a una query dado el contexto activo.
 *
 * Comportamiento según el estado del TenantContext:
 *  - Sin contexto activo   → sin filtro (ruta pública, test sin middleware, proceso batch propio).
 *  - Contexto bypassed     → sin filtro (rol root, ver runUnscoped).
 *  - Scope vacío + activo  → `1 = 0`, salvo `includeGlobal: true` → solo filas NULL del sistema.
 *  - Scope con IDs         → `whereIn(column, scope)`; con `includeGlobal: true` también filas NULL.
 */
function applyTenantFilter(
  query: ScopedQuery,
  column: string,
  options: BusinessUnitScopeOptions = {}
): void {
  if (!TenantContext.isActive()) return
  if (TenantContext.isBypassed()) return

  const scope = TenantContext.getScope()
  const includeGlobal = options.includeGlobal === true

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
 * Precedente alternativo documentado: `WorkingTimeRule` omite el mixin y filtra
 * con queries explícitas `whereNull('business_unit_id')` (USRH1784259058567).
 * Wilvardo eligió `includeGlobal` para catálogos híbridos (sistema + tenant futuro).
 *
 * ## Aplicar a un modelo nuevo (una línea)
 * ```typescript
 * export default class MyModel extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) { ... }
 * ```
 *
 * ## Catálogo global del sistema
 * ```typescript
 * export default class EmployeeType extends compose(
 *   BaseModel,
 *   SoftDeletes,
 *   withBusinessUnitScope('business_unit_id', { includeGlobal: true })
 * ) { ... }
 * ```
 *
 * ## Columna personalizada
 * ```typescript
 * export default class MyModel extends compose(BaseModel, withBusinessUnitScope('tenant_unit_id')) { ... }
 * ```
 *
 * ## Cuándo se filtra
 * El filtro solo se activa cuando hay un `TenantContext` activo en la cadena async
 * (es decir, la request pasó por `BusinessUnitScopeMiddleware`). Las rutas públicas,
 * comandos y tests que no usen el middleware no se ven afectados.
 *
 * ## Bypass explícito
 * ```typescript
 * return TenantContext.runUnscoped(() => myQuery(), 'proceso de sincronización batch')
 * ```
 *
 * @param tenantColumn - Nombre de la columna FK. Por defecto `'business_unit_id'`.
 * @param options - Opciones de scope; `includeGlobal` queda false por defecto.
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
          applyTenantFilter(query, tenantColumn, options)
        })

        this.before('fetch', (query: ScopedQuery) => {
          applyTenantFilter(query, tenantColumn, options)
        })

        this.before('paginate', ([countQuery, query]: ScopedQuery[]) => {
          applyTenantFilter(countQuery, tenantColumn, options)
          applyTenantFilter(query, tenantColumn, options)
        })
      }
    }

    return BusinessUnitScopedModel
  }
}

import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { BaseModel } from '@adonisjs/lucid/orm'
import { TenantContext } from '#utils/tenant_context'

/**
 * Aplica el filtro de tenant a una query dado el contexto activo.
 *
 * Comportamiento según el estado del TenantContext:
 *  - Sin contexto activo   → sin filtro (ruta pública, test sin middleware, proceso batch propio).
 *  - Contexto bypassed     → sin filtro (rol root, ver runUnscoped).
 *  - Scope vacío + activo  → whereRaw('1 = 0') — usuario sin unidades asignadas.
 *  - Scope con IDs         → whereIn(column, scope).
 */
function applyTenantFilter(query: any, column: string): void {
  if (!TenantContext.isActive()) return
  if (TenantContext.isBypassed()) return

  const scope = TenantContext.getScope()

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
 * ## Aplicar a un modelo nuevo (una línea)
 * ```typescript
 * // Antes:
 * export default class MyModel extends compose(BaseModel, SoftDeletes) { ... }
 *
 * // Después:
 * export default class MyModel extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) { ... }
 * ```
 *
 * ## Columna personalizada
 * ```typescript
 * // Si la columna tenant no se llama `business_unit_id`:
 * export default class MyModel extends compose(BaseModel, withBusinessUnitScope('tenant_unit_id')) { ... }
 * ```
 *
 * ## Requisito del modelo
 * El modelo debe tener una columna FK numérica directa hacia `business_units.business_unit_id`.
 * Modelos con relación indirecta o columnas CSV de slugs (p. ej. Shift.shiftBusinessUnits)
 * necesitan normalizar el esquema antes de poder usar este mixin.
 *
 * ## Cuándo se filtra
 * El filtro solo se activa cuando hay un `TenantContext` activo en la cadena async
 * (es decir, la request pasó por `BusinessUnitScopeMiddleware`). Las rutas públicas,
 * comandos y tests que no usen el middleware no se ven afectados.
 *
 * ## Bypass explícito
 * ```typescript
 * // Para root o procesos batch:
 * return TenantContext.runUnscoped(() => myQuery(), 'proceso de sincronización batch')
 * ```
 *
 * @param tenantColumn - Nombre de la columna FK. Por defecto `'business_unit_id'`.
 */
export function withBusinessUnitScope(tenantColumn: string = 'business_unit_id') {
  return function <T extends NormalizeConstructor<typeof BaseModel>>(superclass: T) {
    class BusinessUnitScopedModel extends superclass {
      static boot() {
        super.boot()

        this.before('find', (query: any) => {
          applyTenantFilter(query, tenantColumn)
        })

        this.before('fetch', (query: any) => {
          applyTenantFilter(query, tenantColumn)
        })

        this.before('paginate', ([countQuery, query]: any[]) => {
          applyTenantFilter(countQuery, tenantColumn)
          applyTenantFilter(query, tenantColumn)
        })
      }
    }

    return BusinessUnitScopedModel
  }
}

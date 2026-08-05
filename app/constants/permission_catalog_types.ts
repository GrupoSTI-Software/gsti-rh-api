/**
 * Tipos genéricos del índice maestro de módulos y permisos (USRH1785766406720).
 *
 * Deliberadamente reutilizables por CUALQUIER módulo, no solo por Empleados
 * (el piloto de esta HU): `ActionCatalogEntry` recibe la sección como
 * parámetro genérico (`TSection`) en vez de una unión de literales fija, para
 * que declarar un nuevo módulo más adelante no obligue a tocar este archivo.
 */

/** El proyecto separa deliberadamente ver de cambiar (y de eliminar). */
export type PermissionActionKind = 'read' | 'write' | 'delete'

export type LegacyEquivalenceRelation = 'exact' | 'broader' | 'narrower'

/** Marca que una acción queda fuera del control de permisos, con dueño. */
export interface ActionExemption {
  reason: string
  owner: string
}

/** Equivalencia con lo que ya está registrado en `system_permissions`, por slug (nunca por id). */
export interface LegacyPermissionEquivalence {
  systemPermissionSlug: string
  /**
   * Relación del permiso YA registrado (legacy) respecto a ESTA entrada del catálogo:
   * - exact: son la misma decisión (mismo slug o alias 1:1)
   * - broader: el legacy abre más superficie que esta decisión
   * - narrower: el legacy abre menos superficie que esta decisión
   */
  relation: LegacyEquivalenceRelation
}

export interface ActionCatalogEntry<TSection extends string = string> {
  /** Nombre estable de la acción. Es la clave de identidad — nunca un id numérico. */
  slug: string
  /** Nombre legible para mostrar en la configuración de roles. */
  displayName: string
  kind: PermissionActionKind
  section: TSection
  /** Presente cuando la acción ya existía antes de declararse en este catálogo. */
  legacyEquivalence?: LegacyPermissionEquivalence
  /** Presente cuando la acción queda deliberadamente fuera de la revisión de consistencia. */
  exemption?: ActionExemption
}

export interface ModuleCatalogEntry {
  /** Nombre estable del módulo. Es la clave de identidad — nunca un id numérico. */
  slug: string
  /** Equivalencia informativa con `system_modules`; nunca se usa para buscar/crear (regla 6). */
  legacySystemModuleId?: number
  /**
   * `true` solo cuando el catálogo enumera acción por acción las acciones del
   * módulo. En esta HU, únicamente `employees` (piloto); el resto queda
   * reconocido pero sin acciones enumeradas — deuda conocida, no error.
   */
  actionsEnumerated: boolean
}

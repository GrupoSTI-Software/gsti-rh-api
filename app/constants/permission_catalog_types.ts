/**
 * Tipos genéricos del índice maestro de módulos y permisos (USRH1785766406720).
 *
 * Reutilizables por cualquier módulo con catálogo tipado en
 * `SYSTEM_MODULE_ACTION_CATALOGS` (`system_modules.constant.ts`):
 * `ActionCatalogEntry` recibe la sección como parámetro genérico (`TSection`) en
 * vez de una unión de literales fija, para que declarar un catálogo nuevo no
 * obligue a tocar este archivo.
 */

import type { PermissionGateBypass } from '#constants/permission_gate'

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
  /**
   * Perfil de excepción que alcanza a esta acción (USRH1785766406723).
   * Reutiliza PermissionGateBypass de USRH1785766406721.
   * `strict` = no alcanzable por ninguna excepción (retiro expreso posible incluso a privilegiados).
   */
  exceptionProfile: PermissionGateBypass
  /** Presente cuando la acción ya existía antes de declararse en este catálogo. */
  legacyEquivalence?: LegacyPermissionEquivalence
  /**
   * Presente cuando la acción es un apartado documental: la siembra la descarta
   * (`permissionsFromActionCatalog`) y nunca tiene fila en `system_permissions`.
   */
  exemption?: ActionExemption
}

/**
 * Entrada del índice de módulos vigentes. Solo lleva el slug: si el módulo
 * tiene catálogo tipado se sabe por su clave en `actionsByModule`, no por un
 * campo que repita ese dato.
 */
export interface ModuleCatalogEntry {
  /** Nombre estable del módulo. Es la clave de identidad — nunca un id numérico. */
  slug: string
}

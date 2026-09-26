import { SYSTEM_MODULES_CATALOG } from '#constants/system_modules_catalog'
import {
  SYSTEM_MODULES,
  SYSTEM_MODULES_GROUPED,
  SYSTEM_MODULE_ACTION_CATALOGS,
  type FlatSystemModuleDeclaration,
  type SystemModuleGroupDeclaration,
} from '#constants/system_modules_menu/system_modules.constant'
import { SystemPermissionCatalogError } from '#exceptions/system_permission_catalog_error'
import type {
  ActionCatalogEntry,
  LegacyEquivalenceRelation,
  ModuleCatalogEntry,
} from '#constants/permission_catalog_types'

export { SYSTEM_MODULES_CATALOG } from '#constants/system_modules_catalog'
export type { ModuleSlug } from '#constants/system_modules_catalog'
export { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
export type { EmployeesSection, EmployeeActionSlug } from '#constants/employees_permission_catalog'
export { POSITIONS_PERMISSION_CATALOG } from '#constants/positions_permission_catalog'
export type { PositionsSection, PositionActionSlug } from '#constants/positions_permission_catalog'
export {
  ACCESS_POINT_PERMISSION_CATALOG,
  ACCESS_POINT_MODULE_SLUG,
} from '#constants/access_point_permission_catalog'
export type {
  AccessPointSection,
  AccessPointActionSlug,
} from '#constants/access_point_permission_catalog'
export { ATTENDANCE_MONITOR_PERMISSION_CATALOG } from '#constants/attendance_monitor_permission_catalog'
export type {
  AttendanceMonitorSection,
  AttendanceMonitorActionSlug,
} from '#constants/attendance_monitor_permission_catalog'

/**
 * Índice de permisos (USRH1785766406720): agrega el catálogo de módulos
 * vigentes y las acciones de los módulos con catálogo tipado. Ambos se derivan
 * de `app/constants/system_modules_menu/system_modules.constant.ts`, la fuente
 * única del catálogo; aquí no se declara ningún módulo ni permiso a mano.
 *
 * `actionsByModule` está indexado por el `slug` del módulo en vez de tener un
 * campo fijo por módulo: un catálogo tipado nuevo es una entrada más en
 * `SYSTEM_MODULE_ACTION_CATALOGS`, no un campo nuevo en esta interfaz. Tener
 * clave aquí es lo que marca a un módulo como enumerado.
 */
export interface SystemPermissionCatalog {
  modules: readonly ModuleCatalogEntry[]
  actionsByModule: Readonly<Record<string, readonly ActionCatalogEntry<string>[]>>
}

export const SYSTEM_PERMISSION_CATALOG: SystemPermissionCatalog = {
  modules: SYSTEM_MODULES_CATALOG,
  actionsByModule: SYSTEM_MODULE_ACTION_CATALOGS,
}

/**
 * Lo que la siembra lleva a BD: grupos (0061) y la vista plana de módulos con
 * sus permisos (0062). Los módulos incluyen los retirados, porque su fila
 * sigue ocupando el slug en BD.
 */
export interface SystemCatalogDeclaration {
  groups: readonly Omit<SystemModuleGroupDeclaration, 'modules'>[]
  modules: readonly FlatSystemModuleDeclaration[]
}

export const SYSTEM_CATALOG_DECLARATION: SystemCatalogDeclaration = {
  groups: SYSTEM_MODULES_GROUPED,
  modules: SYSTEM_MODULES,
}

function findFirstDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      return value
    }
    seen.add(value)
  }
  return undefined
}

/**
 * Valida la declaración antes de sembrarla (0062) o de compararla contra BD
 * (`permissions:check-consistency`). Sin efectos secundarios; lanza
 * `SystemPermissionCatalogError` ante la primera violación.
 *
 * Existe porque la siembra identifica por slug y por clave: ante un duplicado
 * el upsert no falla, se queda con la última declaración en silencio. Y una
 * clave de grupo que nadie declara hace que 0062 lance diciendo que 0061 no
 * corrió, lo que manda a buscar el error en el lugar equivocado.
 *
 * Reglas:
 *  - Ninguna clave de grupo se repite (0061 hace upsert por clave).
 *  - Ningún slug de módulo se repite, retirados incluidos.
 *  - Ningún slug de permiso se repite dentro de su módulo.
 *  - Todo módulo con grupo apunta a una clave declarada.
 */
export function validateSystemModulesDeclaration(
  declaration: SystemCatalogDeclaration = SYSTEM_CATALOG_DECLARATION
): void {
  const duplicateGroupKey = findFirstDuplicate(declaration.groups.map((group) => group.key))
  if (duplicateGroupKey) {
    throw new SystemPermissionCatalogError(
      `Clave de grupo duplicada en la constante de módulos: "${duplicateGroupKey}"`
    )
  }

  const duplicateModuleSlug = findFirstDuplicate(
    declaration.modules.map((systemModule) => systemModule.systemModuleSlug)
  )
  if (duplicateModuleSlug) {
    throw new SystemPermissionCatalogError(
      `Slug de módulo duplicado en la constante de módulos: "${duplicateModuleSlug}"`
    )
  }

  const declaredGroupKeys = new Set(declaration.groups.map((group) => group.key))

  for (const systemModule of declaration.modules) {
    const duplicatePermissionSlug = findFirstDuplicate(
      systemModule.systemModulePermissions.map((permission) => permission.systemPermissionSlug)
    )
    if (duplicatePermissionSlug) {
      throw new SystemPermissionCatalogError(
        `Slug de permiso duplicado en el módulo "${systemModule.systemModuleSlug}": "${duplicatePermissionSlug}"`
      )
    }

    if (
      systemModule.systemModuleGroupKey !== null &&
      !declaredGroupKeys.has(systemModule.systemModuleGroupKey)
    ) {
      throw new SystemPermissionCatalogError(
        `El módulo "${systemModule.systemModuleSlug}" apunta al grupo "${systemModule.systemModuleGroupKey}", que no está declarado.`
      )
    }
  }
}

/**
 * Valida la integridad estructural del catálogo (regla 3: nombrar una acción
 * mal declarada se detecta aquí, no cuando el cliente la usa). Sin efectos
 * secundarios; lanza `SystemPermissionCatalogError` ante la primera
 * inconsistencia encontrada.
 */
export function validateCatalogIntegrity(
  catalog: SystemPermissionCatalog = SYSTEM_PERMISSION_CATALOG
): void {
  const duplicateModuleSlug = findFirstDuplicate(catalog.modules.map((m) => m.slug))
  if (duplicateModuleSlug) {
    throw new SystemPermissionCatalogError(
      `Slug de módulo duplicado en el catálogo: "${duplicateModuleSlug}"`
    )
  }

  for (const [moduleSlug, actions] of Object.entries(catalog.actionsByModule)) {
    const duplicateActionSlug = findFirstDuplicate(actions.map((a) => a.slug))
    if (duplicateActionSlug) {
      throw new SystemPermissionCatalogError(
        `Slug de acción duplicado en el módulo "${moduleSlug}": "${duplicateActionSlug}"`
      )
    }

    const ownerModule = catalog.modules.find((m) => m.slug === moduleSlug)
    if (!ownerModule) {
      throw new SystemPermissionCatalogError(
        `El módulo "${moduleSlug}" declara acciones pero no está reconocido en el catálogo de módulos.`
      )
    }

    for (const action of actions) {
      if (!action.section) {
        throw new SystemPermissionCatalogError(
          `La acción "${action.slug}" del módulo "${moduleSlug}" no declara sección.`
        )
      }
      if (action.legacyEquivalence && !action.legacyEquivalence.relation) {
        throw new SystemPermissionCatalogError(
          `La acción "${action.slug}" declara legacyEquivalence sin relation.`
        )
      }
      const allowed: LegacyEquivalenceRelation[] = ['exact', 'broader', 'narrower']
      if (action.legacyEquivalence && !allowed.includes(action.legacyEquivalence.relation)) {
        throw new SystemPermissionCatalogError(`relation inválida en "${action.slug}"`)
      }
    }
  }
}

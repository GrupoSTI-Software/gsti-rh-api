import type { ModuleCatalogEntry } from '#constants/permission_catalog_types'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'

/**
 * Índice de módulos vigentes que recorre el árbol de permisos de sesión.
 *
 * Se deriva de `system_modules.constant.ts`, la fuente única del catálogo:
 * aquí no se declara ningún módulo a mano. Quedan fuera los retirados, que no
 * tienen fila viva en `system_modules`. Si un módulo tiene catálogo tipado se
 * sabe por su clave en `SYSTEM_MODULE_ACTION_CATALOGS`, no por un campo aquí.
 */
export const SYSTEM_MODULES_CATALOG: readonly ModuleCatalogEntry[] = SYSTEM_MODULES.filter(
  (systemModule) => !systemModule.systemModuleRetired
).map((systemModule) => ({
  slug: systemModule.systemModuleSlug,
}))

export type ModuleSlug = (typeof SYSTEM_MODULES)[number]['systemModuleSlug']

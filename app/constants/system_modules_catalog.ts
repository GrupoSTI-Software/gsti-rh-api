import type { ModuleCatalogEntry } from '#constants/permission_catalog_types'
import {
  SYSTEM_MODULES,
  SYSTEM_MODULE_ACTION_CATALOGS,
} from '#constants/system_modules_menu/system_modules.constant'

/**
 * Índice de módulos que consumen el árbol de permisos de sesión, la
 * sincronización del catálogo tipado y `permissions:check-consistency`.
 *
 * Se deriva de `system_modules.constant.ts`, la fuente única del catálogo:
 * aquí no se declara ningún módulo a mano. Quedan fuera los retirados, que no
 * tienen fila viva en `system_modules`. Un módulo tiene `actionsEnumerated`
 * cuando sus acciones viven en un catálogo tipado.
 */
export const SYSTEM_MODULES_CATALOG: readonly ModuleCatalogEntry[] = SYSTEM_MODULES.filter(
  (systemModule) => !systemModule.systemModuleRetired
).map((systemModule) => ({
  slug: systemModule.systemModuleSlug,
  actionsEnumerated: systemModule.systemModuleSlug in SYSTEM_MODULE_ACTION_CATALOGS,
}))

export type ModuleSlug = (typeof SYSTEM_MODULES)[number]['systemModuleSlug']

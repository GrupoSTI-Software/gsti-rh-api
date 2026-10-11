import {
  SYSTEM_MODULES,
  type FlatSystemModuleDeclaration,
} from '#constants/system_modules_menu/system_modules.constant'

/** Separador entre el slug del módulo y el del permiso en `permission_key`. */
const PERMISSION_KEY_SEPARATOR = ':'

/** Vista plana del catálogo con su tipo base (la constante es `as const` por módulo). */
const DECLARED_MODULES: readonly FlatSystemModuleDeclaration[] = SYSTEM_MODULES

export interface ParsedPermissionKey {
  moduleSlug: string
  permissionSlug: string
}

/**
 * Parte `<moduleSlug>:<permissionSlug>`. Devuelve `null` si no tiene exactamente
 * dos segmentos no vacíos.
 */
export function parsePermissionKey(permissionKey: string): ParsedPermissionKey | null {
  const parts = permissionKey.split(PERMISSION_KEY_SEPARATOR)
  if (parts.length !== 2) return null

  const [moduleSlug, permissionSlug] = parts
  if (!moduleSlug || !permissionSlug) return null

  return { moduleSlug, permissionSlug }
}

/**
 * Verdadero si la clave apunta a un permiso declarado de un módulo no retirado.
 *
 * Se deriva de `SYSTEM_MODULES`, la fuente única del catálogo: aquí no se enumera
 * ningún módulo ni permiso (`.claude/rules/catalogo-modulos-permisos.md`).
 */
export function isDeclaredPermissionKey(permissionKey: string): boolean {
  const parsed = parsePermissionKey(permissionKey)
  if (!parsed) return false

  const declaredModule = DECLARED_MODULES.find(
    (systemModule) =>
      systemModule.systemModuleSlug === parsed.moduleSlug && !systemModule.systemModuleRetired
  )
  if (!declaredModule) return false

  return declaredModule.systemModulePermissions.some(
    (permission) => permission.systemPermissionSlug === parsed.permissionSlug
  )
}

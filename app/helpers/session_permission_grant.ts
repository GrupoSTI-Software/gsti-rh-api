import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/**
 * ¿El rol tiene concedida esta acción del catálogo?
 *
 * El sync persiste el slug nuevo cuando la equivalencia no es `exact`.
 * El árbol no puede preguntar solo el slug legacy: un rol con
 * `sensitive-identificacion-read` (y sin `reveal-sensitive-data`) debe
 * seguir viendo la acción permitida.
 *
 * @param action - Entrada del catálogo (slug nuevo + equivalencia opcional).
 * @param grantedSlugs - Slugs concedidos al rol en ese módulo.
 * @returns `true` si el grant nuevo o el legacy cubren la acción.
 */
export function isCatalogActionGranted(
  action: Pick<ActionCatalogEntry<string>, 'slug' | 'legacyEquivalence'>,
  grantedSlugs: ReadonlySet<string>
): boolean {
  if (grantedSlugs.has(action.slug)) {
    return true
  }
  const legacySlug = action.legacyEquivalence?.systemPermissionSlug
  return Boolean(legacySlug && grantedSlugs.has(legacySlug))
}

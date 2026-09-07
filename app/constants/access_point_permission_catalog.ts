import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

export const ACCESS_POINT_MODULE_SLUG = 'puntos-de-acceso'

export type AccessPointSection = 'dispositivos'

/**
 * Acciones del modulo Puntos de acceso (spec ADMS 12). Las cuatro legadas ya
 * estan sembradas (modulo 33) y se declaran con equivalencia exacta; las cinco
 * nuevas las crea la migracion 1788912000008 con concesion espejo (read a
 * read-health; update a reset-upload-progress, manage-commands y
 * reconcile-pins; claim-device solo a super-administrador y rh-manager).
 */
export const ACCESS_POINT_PERMISSION_CATALOG = [
  {
    slug: 'read',
    displayName: 'Ver puntos de acceso',
    kind: 'read',
    section: 'dispositivos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read', relation: 'exact' },
  },
  {
    slug: 'create',
    displayName: 'Registrar puntos de acceso',
    kind: 'write',
    section: 'dispositivos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'create', relation: 'exact' },
  },
  {
    slug: 'update',
    displayName: 'Editar puntos de acceso',
    kind: 'write',
    section: 'dispositivos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'update', relation: 'exact' },
  },
  {
    slug: 'delete',
    displayName: 'Dar de baja puntos de acceso',
    kind: 'delete',
    section: 'dispositivos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'delete', relation: 'exact' },
  },
  {
    slug: 'read-health',
    displayName: 'Ver salud, perfil y avance de los checadores',
    kind: 'read',
    section: 'dispositivos',
    exceptionProfile: 'standard',
  },
  {
    slug: 'claim-device',
    displayName: 'Reclamar un checador en cuarentena',
    kind: 'write',
    section: 'dispositivos',
    exceptionProfile: 'strict',
  },
  {
    slug: 'reset-upload-progress',
    displayName: 'Reiniciar el avance de subida de un checador',
    kind: 'write',
    section: 'dispositivos',
    exceptionProfile: 'standard',
  },
  {
    slug: 'manage-commands',
    displayName: 'Gestionar comandos hacia los checadores',
    kind: 'write',
    section: 'dispositivos',
    exceptionProfile: 'standard',
  },
  {
    slug: 'reconcile-pins',
    displayName: 'Conciliar PINs desconocidos',
    kind: 'write',
    section: 'dispositivos',
    exceptionProfile: 'standard',
  },
] as const satisfies ActionCatalogEntry<AccessPointSection>[]

export type AccessPointActionSlug = (typeof ACCESS_POINT_PERMISSION_CATALOG)[number]['slug']

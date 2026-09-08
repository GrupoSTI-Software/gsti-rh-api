import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

export const ACCESS_POINT_MODULE_SLUG = 'biometric-devices'

export type AccessPointSection = 'dispositivos'

/**
 * Acciones del modulo Dispositivos biometricos (spec ADMS 12). Las cuatro legadas ya
 * estan sembradas (modulo 33) y se declaran con equivalencia exacta; las cinco
 * nuevas las crea la migracion 1788912000008 con concesion espejo (read a
 * read-health; update a reset-upload-progress, manage-commands y
 * reconcile-pins).
 *
 * `claim-device` se retiro: reclamar un checador es acto de plataforma, no de un
 * tenant. El cliente nunca registra dispositivos.
 */
export const ACCESS_POINT_PERMISSION_CATALOG = [
  {
    slug: 'read',
    displayName: 'Ver dispositivos biométricos',
    kind: 'read',
    section: 'dispositivos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read', relation: 'exact' },
  },
  {
    slug: 'create',
    displayName: 'Registrar dispositivos biométricos',
    kind: 'write',
    section: 'dispositivos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'create', relation: 'exact' },
  },
  {
    slug: 'update',
    displayName: 'Editar dispositivos biométricos',
    kind: 'write',
    section: 'dispositivos',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'update', relation: 'exact' },
  },
  {
    slug: 'delete',
    displayName: 'Dar de baja dispositivos biométricos',
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

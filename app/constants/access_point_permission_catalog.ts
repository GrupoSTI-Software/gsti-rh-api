import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

export const ACCESS_POINT_MODULE_SLUG = 'biometric-devices'

export type AccessPointSection = 'dispositivos'

/**
 * Nombre legible de cada sección, serializado en el árbol de permisos de
 * sesión. El `satisfies` obliga a nombrar toda sección nueva.
 */
export const ACCESS_POINT_SECTION_LABELS = {
  'dispositivos': 'Dispositivos',
} as const satisfies Record<AccessPointSection, string>

/**
 * Acciones del módulo Dispositivos biométricos (spec ADMS 12). Las ocho se
 * siembran desde este catálogo vía `0062_system_module_seeder`. Las cuatro
 * legadas (`read`, `create`, `update`, `delete`) conservan `legacyEquivalence`
 * exacta. Las cuatro del canal ADMS (`read-health`, `reset-upload-progress`,
 * `manage-commands`, `reconcile-pins`) nacen sin concesiones: la concesión
 * espejo que hacía la migración 1788912000008 (hoy NO-OP) no la replica ningún
 * seeder, así que se asignan desde Roles y permisos.
 *
 * `claim-device` se retiró: reclamar un checador es acto de plataforma, no de un
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

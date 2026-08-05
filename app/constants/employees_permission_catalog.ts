import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/**
 * Catálogo de acciones autorizables del módulo Empleados (USRH1785766406720),
 * piloto de enumeración completa: las ~28 acciones ya sembradas hoy en
 * `system_permissions` bajo `system_module_id = 1` (`0018_system_permission_seeder.ts`
 * y los seeders puntuales `0047_pii_sensitive_data_module_seeder.ts` /
 * `0051_physical_consent_permission_seeder.ts`), agrupadas por sección.
 *
 * Todas traen `legacyEquivalence` porque ninguna es nueva: esta HU no crea
 * permisos, solo declara los que ya existen (regla de negocio 4). Las
 * acciones granulares nuevas del proyecto de Empleados se declaran en
 * `USRH1785766406722`, no aquí.
 */
export type EmployeesSection =
  | 'datos-persona'
  | 'turnos'
  | 'archivos-expediente'
  | 'responsables-asignacion'
  | 'biometricos'

export const EMPLOYEES_PERMISSION_CATALOG = [
  // --- datos-persona ---
  {
    slug: 'create',
    displayName: 'Crear empleado',
    kind: 'write',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'create', relation: 'exact' },
  },
  {
    slug: 'update',
    displayName: 'Modificar empleado',
    kind: 'write',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'update', relation: 'exact' },
  },
  {
    slug: 'delete',
    displayName: 'Eliminar empleado',
    kind: 'delete',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'delete', relation: 'exact' },
  },
  {
    slug: 'read',
    displayName: 'Consultar empleado',
    kind: 'read',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'read', relation: 'exact' },
  },
  {
    slug: 'update-information',
    displayName: 'Actualizar información del empleado',
    kind: 'write',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'update-information', relation: 'exact' },
  },
  {
    slug: 'read-terminated-employees',
    displayName: 'Consultar empleados dados de baja',
    kind: 'read',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'read-terminated-employees', relation: 'exact' },
  },
  {
    slug: 'reveal-sensitive-data',
    displayName: 'Revelar dato sensible completo',
    kind: 'read',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'reveal-sensitive-data', relation: 'exact' },
  },
  {
    slug: 'register-physical-consent',
    displayName: 'Registrar consentimiento físico',
    kind: 'write',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'register-physical-consent', relation: 'exact' },
  },

  // --- turnos ---
  {
    slug: 'add-exception',
    displayName: 'Registrar excepción de turno',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'add-exception', relation: 'exact' },
  },
  {
    slug: 'manage-shift',
    displayName: 'Administrar turno',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'manage-shift', relation: 'exact' },
  },
  {
    slug: 'manage-vacation',
    displayName: 'Administrar vacaciones',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'manage-vacation', relation: 'exact' },
  },
  {
    slug: 'exception-request',
    displayName: 'Solicitar excepción de turno',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'exception-request', relation: 'exact' },
  },
  {
    slug: 'manage-shift-change',
    displayName: 'Administrar cambio de turno',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'manage-shift-change', relation: 'exact' },
  },
  {
    slug: 'remove-shift-assigned-to-the-day',
    displayName: 'Quitar turno asignado del día',
    kind: 'delete',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'remove-shift-assigned-to-the-day', relation: 'exact' },
  },

  // --- archivos-expediente ---
  {
    slug: 'read-only-files',
    displayName: 'Consultar archivos del expediente',
    kind: 'read',
    section: 'archivos-expediente',
    legacyEquivalence: { systemPermissionSlug: 'read-only-files', relation: 'exact' },
  },
  {
    slug: 'manage-files',
    displayName: 'Administrar archivos del expediente',
    kind: 'write',
    section: 'archivos-expediente',
    legacyEquivalence: { systemPermissionSlug: 'manage-files', relation: 'exact' },
  },
  {
    slug: 'read-work-disabilities',
    displayName: 'Consultar incapacidades',
    kind: 'read',
    section: 'archivos-expediente',
    legacyEquivalence: { systemPermissionSlug: 'read-work-disabilities', relation: 'exact' },
  },
  {
    slug: 'manage-work-disabilities',
    displayName: 'Administrar incapacidades',
    kind: 'write',
    section: 'archivos-expediente',
    legacyEquivalence: { systemPermissionSlug: 'manage-work-disabilities', relation: 'exact' },
  },

  // --- responsables-asignacion ---
  {
    slug: 'manage-responsible-read',
    displayName: 'Consultar responsable asignado',
    kind: 'read',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'manage-responsible-read', relation: 'exact' },
  },
  {
    slug: 'manage-responsible-edit',
    displayName: 'Administrar responsable asignado',
    kind: 'write',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'manage-responsible-edit', relation: 'exact' },
  },
  {
    slug: 'manage-assigned-read',
    displayName: 'Consultar empleados asignados',
    kind: 'read',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'manage-assigned-read', relation: 'exact' },
  },
  {
    slug: 'manage-assigned-edit',
    displayName: 'Administrar empleados asignados',
    kind: 'write',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'manage-assigned-edit', relation: 'exact' },
  },
  {
    slug: 'full-employee-assigned',
    displayName: 'Acceso total a empleados asignados',
    kind: 'write',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'full-employee-assigned', relation: 'exact' },
  },

  // --- biometricos ---
  {
    slug: 'manage-biotime',
    displayName: 'Administrar BioTime',
    kind: 'write',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'manage-biotime', relation: 'exact' },
  },
  {
    slug: 'show-face-id',
    displayName: 'Consultar Face ID',
    kind: 'read',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'show-face-id', relation: 'exact' },
  },
  {
    slug: 'upload-face-id',
    displayName: 'Cargar Face ID',
    kind: 'write',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'upload-face-id', relation: 'exact' },
  },
  {
    slug: 'show-fingers',
    displayName: 'Consultar huellas',
    kind: 'read',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'show-fingers', relation: 'exact' },
  },
  {
    slug: 'upload-fingers',
    displayName: 'Cargar huellas',
    kind: 'write',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'upload-fingers', relation: 'exact' },
  },
] as const satisfies ActionCatalogEntry<EmployeesSection>[]

export type EmployeeActionSlug = (typeof EMPLOYEES_PERMISSION_CATALOG)[number]['slug']

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
    legacyEquivalence: { systemPermissionSlug: 'create' },
  },
  {
    slug: 'update',
    displayName: 'Modificar empleado',
    kind: 'write',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'update' },
  },
  {
    slug: 'delete',
    displayName: 'Eliminar empleado',
    kind: 'delete',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'delete' },
  },
  {
    slug: 'read',
    displayName: 'Consultar empleado',
    kind: 'read',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'read' },
  },
  {
    slug: 'update-information',
    displayName: 'Actualizar información del empleado',
    kind: 'write',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'update-information' },
  },
  {
    slug: 'read-terminated-employees',
    displayName: 'Consultar empleados dados de baja',
    kind: 'read',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'read-terminated-employees' },
  },
  {
    slug: 'reveal-sensitive-data',
    displayName: 'Revelar dato sensible completo',
    kind: 'read',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'reveal-sensitive-data' },
  },
  {
    slug: 'register-physical-consent',
    displayName: 'Registrar consentimiento físico',
    kind: 'write',
    section: 'datos-persona',
    legacyEquivalence: { systemPermissionSlug: 'register-physical-consent' },
  },

  // --- turnos ---
  {
    slug: 'add-exception',
    displayName: 'Registrar excepción de turno',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'add-exception' },
  },
  {
    slug: 'manage-shift',
    displayName: 'Administrar turno',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'manage-shift' },
  },
  {
    slug: 'manage-vacation',
    displayName: 'Administrar vacaciones',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'manage-vacation' },
  },
  {
    slug: 'exception-request',
    displayName: 'Solicitar excepción de turno',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'exception-request' },
  },
  {
    slug: 'manage-shift-change',
    displayName: 'Administrar cambio de turno',
    kind: 'write',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'manage-shift-change' },
  },
  {
    slug: 'remove-shift-assigned-to-the-day',
    displayName: 'Quitar turno asignado del día',
    kind: 'delete',
    section: 'turnos',
    legacyEquivalence: { systemPermissionSlug: 'remove-shift-assigned-to-the-day' },
  },

  // --- archivos-expediente ---
  {
    slug: 'read-only-files',
    displayName: 'Consultar archivos del expediente',
    kind: 'read',
    section: 'archivos-expediente',
    legacyEquivalence: { systemPermissionSlug: 'read-only-files' },
  },
  {
    slug: 'manage-files',
    displayName: 'Administrar archivos del expediente',
    kind: 'write',
    section: 'archivos-expediente',
    legacyEquivalence: { systemPermissionSlug: 'manage-files' },
  },
  {
    slug: 'read-work-disabilities',
    displayName: 'Consultar incapacidades',
    kind: 'read',
    section: 'archivos-expediente',
    legacyEquivalence: { systemPermissionSlug: 'read-work-disabilities' },
  },
  {
    slug: 'manage-work-disabilities',
    displayName: 'Administrar incapacidades',
    kind: 'write',
    section: 'archivos-expediente',
    legacyEquivalence: { systemPermissionSlug: 'manage-work-disabilities' },
  },

  // --- responsables-asignacion ---
  {
    slug: 'manage-responsible-read',
    displayName: 'Consultar responsable asignado',
    kind: 'read',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'manage-responsible-read' },
  },
  {
    slug: 'manage-responsible-edit',
    displayName: 'Administrar responsable asignado',
    kind: 'write',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'manage-responsible-edit' },
  },
  {
    slug: 'manage-assigned-read',
    displayName: 'Consultar empleados asignados',
    kind: 'read',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'manage-assigned-read' },
  },
  {
    slug: 'manage-assigned-edit',
    displayName: 'Administrar empleados asignados',
    kind: 'write',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'manage-assigned-edit' },
  },
  {
    slug: 'full-employee-assigned',
    displayName: 'Acceso total a empleados asignados',
    kind: 'write',
    section: 'responsables-asignacion',
    legacyEquivalence: { systemPermissionSlug: 'full-employee-assigned' },
  },

  // --- biometricos ---
  {
    slug: 'manage-biotime',
    displayName: 'Administrar BioTime',
    kind: 'write',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'manage-biotime' },
  },
  {
    slug: 'show-face-id',
    displayName: 'Consultar Face ID',
    kind: 'read',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'show-face-id' },
  },
  {
    slug: 'upload-face-id',
    displayName: 'Cargar Face ID',
    kind: 'write',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'upload-face-id' },
  },
  {
    slug: 'show-fingers',
    displayName: 'Consultar huellas',
    kind: 'read',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'show-fingers' },
  },
  {
    slug: 'upload-fingers',
    displayName: 'Cargar huellas',
    kind: 'write',
    section: 'biometricos',
    legacyEquivalence: { systemPermissionSlug: 'upload-fingers' },
  },
] as const satisfies ActionCatalogEntry<EmployeesSection>[]

export type EmployeeActionSlug = (typeof EMPLOYEES_PERMISSION_CATALOG)[number]['slug']

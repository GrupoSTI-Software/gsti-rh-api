import type { EmployeeActionSlug } from '#constants/employees_permission_catalog'

export const ROLE_PRESET_MODULE_SLUG = 'employees' as const

export type RolePresetSlug = 'hr-admin' | 'branch-supervisor' | 'read-only' | 'data-entry'
export type RolePresetMode = 'merge' | 'replace'

export interface RolePresetDefinition {
  slug: RolePresetSlug
  name: string
  description: string
  version: string
  moduleSlug: typeof ROLE_PRESET_MODULE_SLUG
  permissionSlugs: readonly EmployeeActionSlug[]
}

const ALL_TAB_SECTIONS = [
  'foto',
  'trabajo',
  'persona',
  'condicion-medica',
  'periodos-lactancia',
  'expediente',
  'consentimiento',
  'domicilio',
  'bancos',
  'responsable',
  'zonas',
  'asignados',
  'biometricos',
  'anotaciones',
  'dispositivos',
  'evaluaciones',
  'assessments',
  'ruta-carrera',
  'certificaciones',
] as const

/** Elimina slugs duplicados preservando el orden de aparición. */
function uniqueSlugs(slugs: EmployeeActionSlug[]): EmployeeActionSlug[] {
  return [...new Set(slugs)]
}

function tabRead(section: (typeof ALL_TAB_SECTIONS)[number]): EmployeeActionSlug {
  return `tab-${section}-read` as EmployeeActionSlug
}

/**
 * Secciones cuya escritura sí la gobierna un `tab-<section>-write` que el API
 * exige de verdad. Quedan fuera `consentimiento`, `responsable` y `asignados`
 * (USRH1787433076993): sus casillas de escritura y eliminación se retiraron
 * del catálogo porque ninguna operación del servidor las consultaba —lo real
 * es `register-physical-consent` para la primera y
 * `manage-responsible-edit` ∨ `manage-assigned-edit` para las otras dos—.
 * Excluirlas aquí convierte en error de compilación cualquier intento de
 * volver a repartirlas desde una plantilla; sin esta exclusión el
 * `as EmployeeActionSlug` de abajo lo dejaría pasar y reventaría en runtime
 * con 422 PLT.RP.MISSING_PERMISSIONS.
 */
type WritableTabSection = Exclude<
  (typeof ALL_TAB_SECTIONS)[number],
  'consentimiento' | 'responsable' | 'asignados'
>

function tabWrite(section: WritableTabSection): EmployeeActionSlug[] {
  return [
    `tab-${section}-read` as EmployeeActionSlug,
    `tab-${section}-write` as EmployeeActionSlug,
  ]
}

function tabFull(section: WritableTabSection): EmployeeActionSlug[] {
  return [
    ...tabWrite(section),
    `tab-${section}-delete` as EmployeeActionSlug,
  ]
}

// --- hr-admin: perfil completo del módulo (incluye salud delicada; turnos e incapacidades) ---
const HR_ADMIN_SLUGS = uniqueSlugs([
  // listado
  'create',
  'update',
  'delete',
  'read',
  'read-terminated-employees',
  'update-information',
  'manage-biotime',
  'import-employees',
  'import-shift-assignments',
  'apply-exception-mass',
  'generate-badges',
  // turnos / vacaciones
  'add-exception',
  'manage-shift',
  'manage-vacation',
  'exception-request',
  'manage-shift-change',
  'remove-shift-assigned-to-the-day',
  // expediente legacy + incapacidades
  'read-only-files',
  'manage-files',
  'read-work-disabilities',
  'manage-work-disabilities',
  // responsable / asignados legacy
  'manage-responsible-read',
  'manage-responsible-edit',
  'manage-assigned-read',
  'manage-assigned-edit',
  'full-employee-assigned',
  // biométricos legacy
  'show-face-id',
  'upload-face-id',
  'show-fingers',
  'upload-fingers',
  'reveal-sensitive-data',
  'register-physical-consent',
  // pestañas
  ...tabFull('foto'),
  ...tabFull('trabajo'),
  ...tabFull('persona'),
  ...tabFull('condicion-medica'),
  ...tabFull('periodos-lactancia'),
  ...tabFull('expediente'),
  'tab-consentimiento-read',
  ...tabFull('domicilio'),
  ...tabFull('bancos'),
  tabRead('responsable'),
  ...tabFull('zonas'),
  tabRead('asignados'),
  ...tabFull('biometricos'),
  ...tabFull('anotaciones'),
  ...tabFull('dispositivos'),
  ...tabFull('evaluaciones'),
  ...tabFull('assessments'),
  ...tabFull('ruta-carrera'),
  ...tabFull('certificaciones'),
  // descargas
  'download-employees-list',
  'download-attendance-report',
  'download-vacations-history',
  'download-proceeding-files',
  // datos delicados (5 categorías)
  'sensitive-identificacion-read',
  'sensitive-identificacion-write',
  'sensitive-contacto-read',
  'sensitive-contacto-write',
  'sensitive-financiero-read',
  'sensitive-financiero-write',
  'sensitive-salud-read',
  'sensitive-salud-write',
  'sensitive-biometrico-read',
  'sensitive-biometrico-write',
])

// --- branch-supervisor ---
const BRANCH_SUPERVISOR_SLUGS = uniqueSlugs([
  'read',
  'generate-badges',
  'add-exception',
  'manage-shift',
  'manage-vacation',
  'exception-request',
  'manage-shift-change',
  'remove-shift-assigned-to-the-day',
  'import-shift-assignments',
  'apply-exception-mass',
  'read-work-disabilities',
  'manage-work-disabilities',
  'manage-responsible-read',
  'manage-assigned-read',
  'manage-assigned-edit',
  'download-attendance-report',
  'download-vacations-history',
  'sensitive-contacto-read',
  tabRead('foto'),
  ...tabWrite('trabajo'),
  tabRead('persona'),
  tabRead('domicilio'),
  ...tabWrite('expediente'),
  tabRead('responsable'),
  ...tabWrite('zonas'),
  tabRead('asignados'),
  ...tabWrite('anotaciones'),
  tabRead('dispositivos'),
  ...tabWrite('evaluaciones'),
  tabRead('assessments'),
  tabRead('ruta-carrera'),
  tabRead('certificaciones'),
  // explícitamente AUSENTES: bancos, condicion-medica, lactancia, biometricos, consentimiento,
  // create, delete, datos financieros/salud/biométricos/identificación delicados
])

// --- read-only (Consulta) ---
const READ_ONLY_SLUGS = uniqueSlugs([
  'read',
  'read-terminated-employees',
  'read-only-files',
  'read-work-disabilities',
  'manage-responsible-read',
  'manage-assigned-read',
  'download-employees-list',
  'sensitive-identificacion-read',
  ...ALL_TAB_SECTIONS.map((s) => tabRead(s)),
])

// --- data-entry (Capturista) ---
const DATA_ENTRY_SLUGS = uniqueSlugs([
  'create',
  'update',
  'read',
  'update-information',
  'import-employees',
  'generate-badges',
  'read-only-files',
  'manage-files',
  'manage-responsible-read',
  'manage-responsible-edit',
  'manage-assigned-read',
  'manage-assigned-edit',
  'register-physical-consent',
  'sensitive-identificacion-read',
  'sensitive-identificacion-write',
  'sensitive-contacto-read',
  'sensitive-contacto-write',
  ...tabWrite('foto'),
  ...tabWrite('trabajo'),
  ...tabWrite('persona'),
  ...tabWrite('domicilio'),
  ...tabWrite('expediente'),
  'tab-consentimiento-read',
  tabRead('responsable'),
  tabRead('asignados'),
  ...tabWrite('certificaciones'),
])

export const ROLE_PRESETS: readonly RolePresetDefinition[] = [
  {
    slug: 'hr-admin',
    name: 'Administrador de RH',
    description:
      'Perfil completo del módulo de Colaboradores: ve, edita y elimina el expediente, opera el listado, descarga todo y accede a las cinco categorías de datos delicados.',
    version: '1.1.0',
    moduleSlug: ROLE_PRESET_MODULE_SLUG,
    permissionSlugs: HR_ADMIN_SLUGS,
  },
  {
    slug: 'branch-supervisor',
    name: 'Supervisor de sucursal',
    description:
      'Ve a su gente y el expediente laboral, anota incidencias, mueve zona/sucursal, evalúa, reportes de asistencia y vacaciones, y gafetes. Sin bancos, salud, lactancia, biométricos ni consentimientos; sin alta ni baja.',
    version: '1.1.0',
    moduleSlug: ROLE_PRESET_MODULE_SLUG,
    permissionSlugs: BRANCH_SUPERVISOR_SLUGS,
  },
  {
    slug: 'read-only',
    name: 'Consulta',
    description:
      'Lectura pura de las diecinueve secciones y el listado (incluidos bajas). Descarga el listado de personal. Sin escritura ni eliminación; datos delicados solo identificación.',
    version: '1.0.0',
    moduleSlug: ROLE_PRESET_MODULE_SLUG,
    permissionSlugs: READ_ONLY_SLUGS,
  },
  {
    slug: 'data-entry',
    name: 'Capturista',
    description:
      'Alta y captura de expediente (foto, ficha, persona, domicilio, documentos, consentimiento, responsable, asignación, certificaciones), importación y gafetes. Sin eliminar ni dar de baja; sin bancos, salud, lactancia, biométricos ni evaluaciones.',
    version: '1.1.0',
    moduleSlug: ROLE_PRESET_MODULE_SLUG,
    permissionSlugs: DATA_ENTRY_SLUGS,
  },
] as const

export function getRolePreset(slug: RolePresetSlug): RolePresetDefinition {
  const preset = ROLE_PRESETS.find((p) => p.slug === slug)
  if (!preset) {
    throw new Error(`Plantilla de rol desconocida: ${slug}`)
  }
  return preset
}

import { SYSTEM_MODULES_CATALOG } from '#constants/system_modules_catalog'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import { SystemPermissionCatalogError } from '#exceptions/system_permission_catalog_error'
import type { ActionCatalogEntry, ModuleCatalogEntry } from '#constants/permission_catalog_types'

export { SYSTEM_MODULES_CATALOG } from '#constants/system_modules_catalog'
export type { ModuleSlug } from '#constants/system_modules_catalog'
export { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
export type { EmployeesSection, EmployeeActionSlug } from '#constants/employees_permission_catalog'

/**
 * Índice maestro único (USRH1785766406720): agrega el catálogo de módulos y
 * las acciones enumeradas por módulo. Cualquier otra lista de
 * módulos/permisos que exista en el código o en los seeders es copia y no
 * manda (regla 1) — este archivo es la fuente de verdad de la que se deriva
 * la sincronización hacia `system_modules` / `system_permissions`.
 *
 * `actionsByModule` está indexado por el `slug` del módulo en vez de tener un
 * campo fijo por módulo (ej. `employees`): así, cuando se enumere un segundo
 * módulo, se agrega una entrada al mapa y no un campo nuevo a esta interfaz.
 */
export interface SystemPermissionCatalog {
  modules: readonly ModuleCatalogEntry[]
  actionsByModule: Readonly<Record<string, readonly ActionCatalogEntry<string>[]>>
}

export const SYSTEM_PERMISSION_CATALOG: SystemPermissionCatalog = {
  modules: SYSTEM_MODULES_CATALOG,
  actionsByModule: {
    employees: EMPLOYEES_PERMISSION_CATALOG,
  },
}

/**
 * Colisiones de id ya existentes en los seeders de siembra, documentadas para
 * que la revisión de consistencia las muestre como hallazgo informativo
 * aparte (decisión confirmada con el usuario). El índice se apoya en el
 * `slug` precisamente para no producir más colisiones de este tipo (regla 6);
 * esta lista es memoria histórica, no algo que la sincronización deba resolver.
 */
/**
 * Uno de los dueños que reclamó el id duplicado. `moduleId`/`moduleSlug` solo
 * aplican a colisiones `kind: 'permission'` (el módulo al que el seeder ligó
 * ese permiso); en colisiones `kind: 'module'` se omiten porque un módulo no
 * pertenece a otro módulo.
 */
export interface KnownDuplicateIdClaim {
  slug: string
  seederFile: string
  moduleId?: number
  moduleSlug?: string
}

export interface KnownDuplicateIdFinding {
  kind: 'module' | 'permission'
  id: number
  claimedBy: KnownDuplicateIdClaim[]
}

export const KNOWN_DUPLICATE_IDS: KnownDuplicateIdFinding[] = [
  {
    kind: 'module',
    id: 41,
    claimedBy: [
      { slug: 'complaints', seederFile: '0037_complaints_module_seeder.ts' },
      {
        slug: 'traumatic-event-reports-registry',
        seederFile: '0038_traumatic_event_registry_module_seeder.ts',
      },
    ],
  },
  {
    kind: 'module',
    id: 46,
    claimedBy: [
      { slug: 'telework-workers', seederFile: '0017_system_module_seeder.ts' },
      { slug: 'consent-evidence', seederFile: '0048_consent_evidence_module_seeder.ts' },
      {
        slug: 'legal-documents',
        seederFile: '0048_legal_documents_management_module_seeder.ts',
      },
      {
        slug: 'sensitive-data-access-log',
        seederFile: '0049_sensitive_data_access_log_module_seeder.ts',
      },
    ],
  },
  {
    kind: 'permission',
    id: 166,
    claimedBy: [
      {
        slug: 'gestion',
        moduleId: 38,
        seederFile: '0018_system_permission_seeder.ts',
      },
      {
        slug: 'create',
        moduleId: 40,
        moduleSlug: 'traumatic-event-reports',
        seederFile: '0036_traumatic_event_reports_module_seeder.ts',
      },
    ],
  },
  {
    kind: 'permission',
    id: 169,
    claimedBy: [
      {
        slug: 'shift-coverage',
        moduleId: 7,
        seederFile: '0018_system_permission_seeder.ts',
      },
      {
        slug: 'read',
        moduleId: 41,
        moduleSlug: 'complaints',
        seederFile: '0037_complaints_module_seeder.ts',
      },
      {
        slug: 'read',
        moduleId: 41,
        moduleSlug: 'traumatic-event-reports-registry',
        seederFile: '0038_traumatic_event_registry_module_seeder.ts',
      },
    ],
  },
  {
    kind: 'permission',
    id: 173,
    claimedBy: [
      {
        slug: 'read',
        moduleId: 42,
        moduleSlug: 'compliance',
        seederFile: '0018_system_permission_seeder.ts',
      },
      {
        slug: 'reveal-identity',
        moduleId: 41,
        moduleSlug: 'complaints',
        seederFile: '0037_complaints_module_seeder.ts',
      },
    ],
  },
  {
    kind: 'permission',
    id: 174,
    claimedBy: [
      {
        slug: 'report',
        moduleId: 41,
        moduleSlug: 'complaints',
        seederFile: '0037_complaints_module_seeder.ts',
      },
      {
        slug: 'write',
        moduleId: 42,
        moduleSlug: 'compliance',
        seederFile: '0039_nom035_questionnaire_application_permissions_seeder.ts',
      },
    ],
  },
  {
    kind: 'permission',
    id: 187,
    claimedBy: [
      {
        slug: 'read',
        moduleId: 46,
        seederFile: '0018_system_permission_seeder.ts',
      },
      {
        slug: 'export-sensitive-data',
        moduleId: 42,
        seederFile: '0048_export_sensitive_data_permission_seeder.ts',
      },
      {
        slug: 'read',
        moduleId: 46,
        moduleSlug: 'legal-documents',
        seederFile: '0048_legal_documents_management_module_seeder.ts',
      },
      {
        slug: 'read',
        moduleId: 46,
        moduleSlug: 'consent-evidence',
        seederFile: '0049_consent_evidence_permissions_seeder.ts',
      },
    ],
  },
  {
    kind: 'permission',
    id: 188,
    claimedBy: [
      {
        slug: 'create',
        moduleId: 46,
        moduleSlug: 'legal-documents',
        seederFile: '0048_legal_documents_management_module_seeder.ts',
      },
      {
        slug: 'reveal',
        moduleId: 46,
        moduleSlug: 'consent-evidence',
        seederFile: '0049_consent_evidence_permissions_seeder.ts',
      },
      {
        slug: 'read',
        moduleId: 46,
        moduleSlug: 'sensitive-data-access-log',
        seederFile: '0049_sensitive_data_access_log_module_seeder.ts',
      },
    ],
  },
  {
    kind: 'permission',
    id: 194,
    claimedBy: [
      {
        slug: 'register-physical-consent',
        moduleId: 1,
        moduleSlug: 'employees',
        seederFile: '0051_physical_consent_permission_seeder.ts',
      },
      {
        slug: 'read',
        moduleId: 48,
        moduleSlug: 'reform-simulation',
        seederFile: '0051_reform_simulation_module_seeder.ts',
      },
    ],
  },
]

function findFirstDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      return value
    }
    seen.add(value)
  }
  return undefined
}

/**
 * Valida la integridad estructural del catálogo (regla 3: nombrar una acción
 * mal declarada se detecta aquí, no cuando el cliente la usa). Sin efectos
 * secundarios; lanza `SystemPermissionCatalogError` ante la primera
 * inconsistencia encontrada.
 */
export function validateCatalogIntegrity(
  catalog: SystemPermissionCatalog = SYSTEM_PERMISSION_CATALOG
): void {
  const duplicateModuleSlug = findFirstDuplicate(catalog.modules.map((m) => m.slug))
  if (duplicateModuleSlug) {
    throw new SystemPermissionCatalogError(
      `Slug de módulo duplicado en el catálogo: "${duplicateModuleSlug}"`
    )
  }

  for (const [moduleSlug, actions] of Object.entries(catalog.actionsByModule)) {
    const duplicateActionSlug = findFirstDuplicate(actions.map((a) => a.slug))
    if (duplicateActionSlug) {
      throw new SystemPermissionCatalogError(
        `Slug de acción duplicado en el módulo "${moduleSlug}": "${duplicateActionSlug}"`
      )
    }

    const ownerModule = catalog.modules.find((m) => m.slug === moduleSlug)
    if (!ownerModule) {
      throw new SystemPermissionCatalogError(
        `El módulo "${moduleSlug}" declara acciones pero no está reconocido en el catálogo de módulos.`
      )
    }
    if (actions.length > 0 && !ownerModule.actionsEnumerated) {
      throw new SystemPermissionCatalogError(
        `El módulo "${moduleSlug}" tiene acciones declaradas pero actionsEnumerated=false.`
      )
    }

    for (const action of actions) {
      if (!action.section) {
        throw new SystemPermissionCatalogError(
          `La acción "${action.slug}" del módulo "${moduleSlug}" no declara sección.`
        )
      }
    }
  }
}

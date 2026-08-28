import type { ModuleCatalogEntry } from '#constants/permission_catalog_types'

/**
 * Índice maestro de módulos del sistema (USRH1785766406720).
 *
 * Reconoce, por slug, los 44 módulos que hoy están repartidos entre el
 * catálogo base (`0017_system_module_seeder.ts`) y los seeders incrementales
 * de módulo agregados después. Ninguno se enumera aquí por su id: el id es
 * solo una equivalencia informativa (`legacySystemModuleId`) para
 * trazabilidad — la sincronización y la revisión de consistencia siempre
 * resuelven por `slug` (regla de negocio 6).
 *
 * `actionsEnumerated: true` en `employees` (piloto de la HU
 * USRH1785766406720), en `positions` (USRH1787433076995, permiso de alta y
 * rangos salariales del puesto) y en `employees-attendance-monitor`
 * (USRH1787433076991, descargas del monitor de asistencia). El resto queda
 * reconocido pero sin sus acciones declaradas todavía — deuda conocida
 * explícita (ver supuesto de la HU), no un error de la revisión de
 * consistencia.
 *
 * Los módulos marcados "colisión de id conocida" no traen
 * `legacySystemModuleId` a propósito: en la base de datos real, más de un
 * seeder reclama el mismo número para módulos distintos (ver
 * `KNOWN_DUPLICATE_IDS` en `system_permission_catalog.ts`). Declarar aquí un
 * id ambiguo no ayudaría a nadie — el slug ya es identidad suficiente.
 */
export const SYSTEM_MODULES_CATALOG = [
  // --- Catálogo base: 0017_system_module_seeder.ts ---
  { slug: 'employees', legacySystemModuleId: 1, actionsEnumerated: true },
  { slug: 'departments', legacySystemModuleId: 2, actionsEnumerated: false },
  { slug: 'positions', legacySystemModuleId: 3, actionsEnumerated: true },
  { slug: 'vacations', legacySystemModuleId: 4, actionsEnumerated: false },
  { slug: 'users', legacySystemModuleId: 5, actionsEnumerated: false },
  { slug: 'departments-attendance-monitor', legacySystemModuleId: 6, actionsEnumerated: false },
  { slug: 'employees-attendance-monitor', legacySystemModuleId: 7, actionsEnumerated: true },
  { slug: 'roles-and-permissions', legacySystemModuleId: 8, actionsEnumerated: false },
  { slug: 'shifts', legacySystemModuleId: 12, actionsEnumerated: false },
  { slug: 'holidays', legacySystemModuleId: 13, actionsEnumerated: false },
  { slug: 'system-settings', legacySystemModuleId: 14, actionsEnumerated: false },
  { slug: 'documents-expiration-matrix', legacySystemModuleId: 19, actionsEnumerated: false },
  { slug: 'proceeding-file-types', legacySystemModuleId: 21, actionsEnumerated: false },
  { slug: 'shift-exception-requests', legacySystemModuleId: 22, actionsEnumerated: false },
  { slug: 'organization-chart', legacySystemModuleId: 25, actionsEnumerated: false },
  { slug: 'birthdays-calendar', legacySystemModuleId: 26, actionsEnumerated: false },
  { slug: 'vacations-calendar', legacySystemModuleId: 27, actionsEnumerated: false },
  { slug: 'work-anniversaries-calendar', legacySystemModuleId: 28, actionsEnumerated: false },
  { slug: 'supplies', legacySystemModuleId: 29, actionsEnumerated: false },
  { slug: 'zonas', legacySystemModuleId: 30, actionsEnumerated: false },
  { slug: 'permissions-history', legacySystemModuleId: 31, actionsEnumerated: false },
  { slug: 'avisos-y-noticias', legacySystemModuleId: 32, actionsEnumerated: false },
  { slug: 'puntos-de-acceso', legacySystemModuleId: 33, actionsEnumerated: false },
  { slug: 'sucursales', legacySystemModuleId: 34, actionsEnumerated: false },
  { slug: 'assessment-templates', legacySystemModuleId: 35, actionsEnumerated: false },
  { slug: 'certifications', legacySystemModuleId: 36, actionsEnumerated: false },
  { slug: 'employee-lactation-periods', legacySystemModuleId: 37, actionsEnumerated: false },
  { slug: 'repse-registrations', legacySystemModuleId: 38, actionsEnumerated: false },
  { slug: 'compliance', legacySystemModuleId: 42, actionsEnumerated: false },
  { slug: 'telework-workers', legacySystemModuleId: 46, actionsEnumerated: false },

  // --- Módulos incrementales (seeders posteriores a 0017) ---
  { slug: 'working-time-overrides', legacySystemModuleId: 39, actionsEnumerated: false },
  { slug: 'traumatic-event-reports', legacySystemModuleId: 40, actionsEnumerated: false },
  { slug: 'complaints', legacySystemModuleId: 41, actionsEnumerated: false },
  // colisión de id conocida: 41 también lo reclama 0038 (ver arriba)
  { slug: 'traumatic-event-reports-registry', actionsEnumerated: false },
  { slug: 'retention-policy', legacySystemModuleId: 43, actionsEnumerated: false },
  { slug: 'attention-program', legacySystemModuleId: 44, actionsEnumerated: false },
  { slug: 'nom035-disclosure', legacySystemModuleId: 45, actionsEnumerated: false },
  // colisión de id conocida: 46 ya lo reclama 'telework-workers' (arriba) y también 'legal-documents' / 'sensitive-data-access-log'
  { slug: 'consent-evidence', actionsEnumerated: false },
  { slug: 'legal-documents', actionsEnumerated: false },
  { slug: 'sensitive-data-access-log', actionsEnumerated: false },
  { slug: 'telework-policy', legacySystemModuleId: 47, actionsEnumerated: false },
  { slug: 'reform-simulation', legacySystemModuleId: 48, actionsEnumerated: false },
  { slug: 'repse-providers', legacySystemModuleId: 49, actionsEnumerated: false },
  { slug: 'regulatory-coverage', legacySystemModuleId: 50, actionsEnumerated: false },
] as const satisfies ModuleCatalogEntry[]

export type ModuleSlug = (typeof SYSTEM_MODULES_CATALOG)[number]['slug']

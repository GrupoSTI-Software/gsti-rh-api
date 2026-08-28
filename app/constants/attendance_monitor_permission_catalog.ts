import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/**
 * Secciones del monitor de asistencia (USRH1787433076991). En español,
 * igual que `employees`: agrupan las acciones para la matriz de roles.
 */
export type AttendanceMonitorSection = 'listado' | 'nomina' | 'asistencia' | 'descargas'

/**
 * Las 11 acciones del módulo `employees-attendance-monitor`.
 *
 * Las once YA están sembradas desde `0018_system_permission_seeder.ts`
 * (`systemModuleId: 7`), por eso todas declaran `legacyEquivalence` exacta
 * contra su propio slug: `SystemPermissionCatalogSyncService.ensureAction`
 * las reconoce y no crea fila nueva, e `isCatalogActionGranted` sigue
 * respetando las concesiones que cada cliente ya tiene. Enumerarlas no
 * concede ni retira nada a nadie (regla 8 de la HU).
 *
 * `displayName` en español: solo se materializa en una base donde la fila
 * no existiera — el sync nunca renombra lo ya registrado.
 *
 * Esta HU solo cambia el consumidor de `download-summary` y `see-payroll`
 * (las descargas del monitor en el backoffice). Las otras nueve se enumeran
 * porque la revisión de consistencia reporta como `registeredNotDeclared`
 * toda fila viva del módulo que el catálogo no declare; su gobierno sigue
 * exactamente como está.
 */
export const ATTENDANCE_MONITOR_PERMISSION_CATALOG = [
  {
    slug: 'read',
    displayName: 'Ver el monitor de asistencia',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read', relation: 'exact' },
  },
  {
    slug: 'read-time-worked',
    displayName: 'Ver el tiempo trabajado',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'read-time-worked', relation: 'exact' },
  },
  {
    slug: 'consecutive-faults',
    displayName: 'Ver faltas consecutivas',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'consecutive-faults', relation: 'exact' },
  },
  {
    slug: 'shift-coverage',
    displayName: 'Ver cobertura de turnos',
    kind: 'read',
    section: 'listado',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'shift-coverage', relation: 'exact' },
  },
  {
    slug: 'see-payroll',
    displayName: 'Ver el modo de nómina',
    kind: 'read',
    section: 'nomina',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'see-payroll', relation: 'exact' },
  },
  {
    slug: 'display-payments-summary',
    displayName: 'Ver pagos en el resumen',
    kind: 'read',
    section: 'nomina',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'display-payments-summary', relation: 'exact' },
  },
  {
    slug: 'display-discounts-summary',
    displayName: 'Ver descuentos en el resumen',
    kind: 'read',
    section: 'nomina',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'display-discounts-summary', relation: 'exact' },
  },
  {
    slug: 'add-assist-manual',
    displayName: 'Capturar asistencia manual',
    kind: 'write',
    section: 'asistencia',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'add-assist-manual', relation: 'exact' },
  },
  {
    slug: 'sync-assist',
    displayName: 'Sincronizar asistencia',
    kind: 'write',
    section: 'asistencia',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'sync-assist', relation: 'exact' },
  },
  {
    slug: 'delete-check-assist',
    displayName: 'Eliminar una checada',
    kind: 'delete',
    section: 'asistencia',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'delete-check-assist', relation: 'exact' },
  },
  {
    slug: 'download-summary',
    displayName: 'Descargar el resumen de incidencias',
    kind: 'read',
    section: 'descargas',
    exceptionProfile: 'standard',
    legacyEquivalence: { systemPermissionSlug: 'download-summary', relation: 'exact' },
  },
] as const satisfies ActionCatalogEntry<AttendanceMonitorSection>[]

export type AttendanceMonitorActionSlug =
  (typeof ATTENDANCE_MONITOR_PERMISSION_CATALOG)[number]['slug']

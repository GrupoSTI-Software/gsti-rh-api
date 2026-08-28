import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/** Sección en inglés: positions no tiene pestañas de UI como employees. */
export type PositionsSection = 'salary-ranges'

export const POSITIONS_PERMISSION_CATALOG = [
  {
    slug: 'salary-ranges-read',
    displayName: 'Ver rangos salariales del puesto',
    kind: 'read',
    section: 'salary-ranges',
    exceptionProfile: 'standard',
    // Sin legacyEquivalence: 0018 no siembra permisos con systemModuleId: 3.
  },
  {
    slug: 'salary-ranges-write',
    displayName: 'Registrar y corregir rangos salariales',
    kind: 'write',
    section: 'salary-ranges',
    exceptionProfile: 'standard',
  },
  {
    slug: 'salary-ranges-delete',
    displayName: 'Cerrar rangos salariales',
    kind: 'delete',
    section: 'salary-ranges',
    exceptionProfile: 'standard',
  },
  {
    slug: 'salary-ranges-audit-read',
    displayName: 'Consultar la bitácora del rango salarial',
    kind: 'read',
    section: 'salary-ranges',
    exceptionProfile: 'standard',
  },
] as const satisfies ActionCatalogEntry<PositionsSection>[]

export type PositionActionSlug = (typeof POSITIONS_PERMISSION_CATALOG)[number]['slug']

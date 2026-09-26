import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/** Sección en inglés: positions no tiene pestañas de UI como employees. */
export type PositionsSection = 'salary-ranges'

/**
 * Nombre legible de cada sección, serializado en el árbol de permisos de
 * sesión. El slug es en inglés, el nombre visible no.
 */
export const POSITIONS_SECTION_LABELS = {
  'salary-ranges': 'Rangos salariales',
} as const satisfies Record<PositionsSection, string>

export const POSITIONS_PERMISSION_CATALOG = [
  {
    slug: 'salary-ranges-read',
    displayName: 'Ver rangos salariales del puesto',
    kind: 'read',
    section: 'salary-ranges',
    exceptionProfile: 'standard',
    // Sin legacyEquivalence: acción nueva, sin permiso previo equivalente.
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

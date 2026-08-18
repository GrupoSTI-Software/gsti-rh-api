/**
 * Constantes del catálogo de conceptos de salida (USRH1786568279581).
 * Fuente única del conjunto de orígenes válidos y del conjunto base que se
 * siembra de forma perezosa por empresa.
 */

/**
 * Slug del módulo de menú del backoffice que gobierna el permiso (regla 9).
 * En plural: `employee-offboarding` a secas ya está tomado por un
 * `system_feature` (`0032_system_feature_seeder.ts`).
 */
export const EMPLOYEE_OFFBOARDINGS_MODULE_SLUG = 'employee-offboardings'

/** Orígenes válidos del concepto. String en BD (no enum): un tercer origen entra sin migración. */
export const OFFBOARDING_CONCEPT_SOURCES = ['manual', 'employee_supplies'] as const

export type OffboardingConceptSource = (typeof OFFBOARDING_CONCEPT_SOURCES)[number]

export const OFFBOARDING_CONCEPT_SOURCE = {
  MANUAL: 'manual',
  EMPLOYEE_SUPPLIES: 'employee_supplies',
} as const satisfies Record<string, OffboardingConceptSource>

/** Forma de un renglón del conjunto base (la siembra completa empresa y orden). */
export interface OffboardingBaseConcept {
  name: string
  requiresEvidence: boolean
  allowsAmount: boolean
  source: OffboardingConceptSource
}

/**
 * Conjunto base que recibe cada empresa la primera vez que consulta su
 * catálogo (reglas 1, 2 y 7). El orden del arreglo ES el orden 1..n de la
 * siembra. Idioma: español — decisión abierta R-3 del spec; si se cierra a
 * favor de una referencia de traducción, solo se toca esta constante y la
 * lectura del nombre.
 *
 * Agregar conceptos aquí NO afecta a empresas ya sembradas: la guarda de
 * conteo de `ensureSeeded` las deja intactas (riesgo R-1, comportamiento
 * deseado).
 */
export const OFFBOARDING_BASE_CONCEPTS: readonly OffboardingBaseConcept[] = [
  {
    name: 'Entrega de activos asignados',
    requiresEvidence: true,
    allowsAmount: false,
    source: OFFBOARDING_CONCEPT_SOURCE.EMPLOYEE_SUPPLIES,
  },
  {
    name: 'Finiquito',
    requiresEvidence: true,
    allowsAmount: true,
    source: OFFBOARDING_CONCEPT_SOURCE.MANUAL,
  },
  {
    name: 'Adeudos pendientes',
    requiresEvidence: true,
    allowsAmount: true,
    source: OFFBOARDING_CONCEPT_SOURCE.MANUAL,
  },
  {
    name: 'Documento que avala la salida',
    requiresEvidence: true,
    allowsAmount: false,
    source: OFFBOARDING_CONCEPT_SOURCE.MANUAL,
  },
  {
    name: 'Devolución de accesos y credenciales',
    requiresEvidence: false,
    allowsAmount: false,
    source: OFFBOARDING_CONCEPT_SOURCE.MANUAL,
  },
] as const

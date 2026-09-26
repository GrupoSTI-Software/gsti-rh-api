/**
 * Constantes del simulador de reforma de jornada (escalones 2026–2030).
 * Los topes en runtime salen de getRulesForDate; aquí solo se fijan los años válidos.
 */

/** Escalones de la reforma incluidos en la comparativa de la respuesta. */
export const REFORM_SIMULATION_COMPARISON_YEARS = [2026, 2027, 2028, 2029, 2030] as const

/** Año mínimo aceptado como escenario objetivo (base actual). */
export const REFORM_SIMULATION_MIN_TARGET_YEAR = 2026

/** Año máximo aceptado como escenario objetivo (último escalón sembrado). */
export const REFORM_SIMULATION_MAX_TARGET_YEAR = 2030

export type ReformSimulationComparisonYearValue =
  (typeof REFORM_SIMULATION_COMPARISON_YEARS)[number]

export type ReformSimulationTargetYear = ReformSimulationComparisonYearValue

/** Conjunto de años válidos para validación y comparativa. */
export const REFORM_SIMULATION_TARGET_YEARS: readonly ReformSimulationTargetYear[] =
  REFORM_SIMULATION_COMPARISON_YEARS

/**
 * Fecha con la que se consulta el motor de jornada para un año objetivo.
 * Ventanas federales sembradas cubren el año civil completo (1-ene a 31-dic).
 */
export function buildReformSimulationQueryDate(year: number): string {
  return `${year}-01-01`
}

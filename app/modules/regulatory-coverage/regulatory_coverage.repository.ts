import type { RegulationCoverageRow } from './dto/regulatory_coverage.dto.js'

/**
 * Contrato del repositorio de regulatory-coverage.
 *
 * Devuelve una fila por cada norma con estatus `vigente`, con todos los
 * conteos de numerales hoja ya calculados. La implementación MySQL resuelve
 * el cálculo completo en consultas agregadas para evitar N+1.
 */
export interface RegulatoryCoverageRepository {
  /**
   * Obtiene la cobertura calculada de todas las normas vigentes.
   *
   * Cálculo de numerales hoja:
   * - Un numeral hoja es una cláusula que no es `parent_regulation_clause_id`
   *   de ninguna otra cláusula (excluyendo soft-deleted).
   * - Solo se consideran mapeos a features con `system_feature_status = 'disponible'`.
   * - Peso: 1.0 si el mejor mapeo disponible es `total`; 0.5 si es `parcial`.
   */
  getCoverageByRegulation(): Promise<RegulationCoverageRow[]>
}

import type {
  RegulationCoverageRow,
  RegulatoryCoverageSummaryResponse,
  RegulationDetailResponse,
} from './dto/regulatory_coverage.dto.js'

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

  /**
   * Obtiene el resumen de cobertura con desglose por bucket acumulativo de
   * `system_feature_status` (disponible / en_desarrollo / planeado).
   *
   * Devuelve el agregado cross-norma y una fila por norma vigente con los
   * tres porcentajes de cobertura proyectada. Las features con status
   * `deprecado` quedan fuera de todos los buckets.
   */
  getCoverageSummary(): Promise<RegulatoryCoverageSummaryResponse>

  /**
   * Obtiene el detalle completo de una norma vigente: cabecera con los mismos
   * conteos que `getCoverageByRegulation` y el listado de numerales hoja con
   * su mejor cobertura disponible y todas las features no-deprecadas mapeadas.
   *
   * @returns El detalle de la norma, o `null` si no existe / no está vigente.
   */
  getRegulationDetail(regulationId: number): Promise<RegulationDetailResponse | null>
}

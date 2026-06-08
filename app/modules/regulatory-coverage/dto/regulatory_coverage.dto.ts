/**
 * DTOs del módulo regulatory-coverage.
 *
 * Define la forma de los datos que fluyen entre el repositorio, el servicio
 * y la respuesta HTTP del endpoint GET /api/v1/regulatory-coverage.
 */

/** Fila cruda que devuelve el repositorio por cada norma vigente. */
export interface RegulatoryAuthorityInfo {
  /** Identificador textual único de la autoridad (p. ej. "stps"). */
  slug: string
  /** Siglas o nombre corto (p. ej. "STPS"). */
  shortName: string
}

/** Datos de una norma con sus conteos de numerales hoja. */
export interface RegulationCoverageRow {
  regulationId: number
  regulationCode: string
  regulationTitle: string
  regulationType: string
  regulationVersion: string
  regulationStatus: string
  authority: RegulatoryAuthorityInfo
  /**
   * Conteo de numerales hoja (cláusulas sin sub-cláusulas, excluyendo soft-deleted).
   * Denominador del cálculo de cobertura.
   */
  evaluableClauses: number
  /**
   * Numerales hoja cubiertos con cobertura total
   * (al menos un mapeo a feature disponible con coverage = 'total').
   */
  coveredTotal: number
  /**
   * Numerales hoja cubiertos con cobertura parcial
   * (mayor cobertura disponible es 'parcial').
   */
  coveredPartial: number
  /** Numerales hoja sin ningún mapeo a feature disponible. */
  uncovered: number
  /**
   * Porcentaje de cobertura ponderado: (coveredTotal × 1 + coveredPartial × 0.5)
   * / evaluableClauses × 100, redondeado a 1 decimal.
   * `null` cuando evaluableClauses === 0 para evitar división entre cero.
   */
  coveragePercentage: number | null
}

/** Forma que devuelve el repositorio por cada numeral hoja, con el mejor mapeo disponible. */
export interface LeafClauseCoverageRaw {
  regulationId: number
  /** Mejor cobertura disponible del numeral: 'total', 'parcial' o null (sin cobertura). */
  bestCoverage: 'total' | 'parcial' | null
}

/** Forma de la respuesta HTTP 200. */
export interface RegulatoryCoverageResponse {
  regulations: RegulationCoverageRow[]
}

// ─── DTOs del summary (GET /api/v1/regulatory-coverage/summary) ──────────────

/**
 * Porcentajes de cobertura desglosados por bucket acumulativo.
 *
 * Los buckets son acumulativos en orden creciente:
 * - `disponible`  : solo features con status `disponible`.
 * - `enDesarrollo`: features con status `disponible` + `en_desarrollo`.
 * - `planeado`    : features con status `disponible` + `en_desarrollo` + `planeado`.
 *
 * `null` en un bucket cuando `evaluableClauses` es 0 (sin denominador).
 */
export interface CoverageBucketPercentages {
  disponible: number | null
  enDesarrollo: number | null
  planeado: number | null
}

/** Fila por norma vigente en la respuesta del summary. */
export interface RegulationSummaryRow {
  regulationId: number
  regulationCode: string
  regulationTitle: string
  regulationVersion: string
  authority: RegulatoryAuthorityInfo
  /** Numerales hoja evaluables (denominador del cálculo). */
  evaluableClauses: number
  /** Porcentaje de cobertura por bucket acumulativo. */
  coveragePercentage: CoverageBucketPercentages
}

/** Agregado global cross-norma del summary. */
export interface SummaryAggregate {
  /** Total de numerales hoja en todas las normas vigentes (denominador global). */
  evaluableClauses: number
  /** Porcentaje global de cobertura por bucket acumulativo. */
  coveragePercentage: CoverageBucketPercentages
}

/** Forma de la respuesta HTTP 200 de GET /api/v1/regulatory-coverage/summary. */
export interface RegulatoryCoverageSummaryResponse {
  aggregate: SummaryAggregate
  regulations: RegulationSummaryRow[]
}

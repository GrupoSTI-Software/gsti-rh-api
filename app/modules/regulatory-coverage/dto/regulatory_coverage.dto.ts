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

// ─── DTOs del detalle (GET /api/v1/regulatory-coverage/:regulationId) ──────────

/** Módulo del sistema al que pertenece una feature. */
export interface FeatureModuleInfo {
  moduleId: number
  moduleName: string
  moduleSlug: string
}

/**
 * Feature mapeada a un numeral regulatorio, con su módulo.
 * Incluye todas las features no-deprecadas (planeado, en_desarrollo, disponible).
 * El `coverage` refleja el grado de la pivote `regulation_clause_features`.
 */
export interface ClauseFeatureDetail {
  systemFeatureId: number
  featureName: string
  featureSlug: string
  /** Estado global de release. Nunca 'deprecado' en la respuesta. */
  featureStatus: 'planeado' | 'en_desarrollo' | 'disponible'
  /** Grado de cobertura de esta feature sobre el numeral (de la pivote). */
  coverage: 'total' | 'parcial' | null
  module: FeatureModuleInfo
}

/** Numeral hoja con su cobertura calculada y sus features mapeadas. */
export interface RegulationClauseDetail {
  regulationClauseId: number
  /** Código del numeral (p. ej. "4.3.2"). */
  code: string
  /**
   * Clave i18n del título del numeral.
   * Puede ser null; el BO usa `code` como fallback de visualización.
   */
  titleKey: string | null
  /**
   * Clave i18n del texto de la obligación normativa del numeral.
   * El BO la usa para mostrar el contenido en el drawer de detalle.
   */
  obligationKey: string
  /**
   * Clave i18n de la explicación adicional del numeral.
   * Puede ser vacía si no aplica.
   */
  explanationKey: string
  /**
   * Mejor cobertura disponible calculada solo sobre features `disponible`.
   * - 'total'  : al menos una feature disponible cubre totalmente el numeral.
   * - 'parcial': la mejor cobertura disponible es parcial.
   * - null     : sin cobertura disponible (puede haber features en_desarrollo/planeado).
   */
  bestCoverage: 'total' | 'parcial' | null
  /** Features no-deprecadas mapeadas al numeral, con su módulo. */
  features: ClauseFeatureDetail[]
}

/**
 * Cabecera de la norma en la respuesta de detalle.
 * Los conteos son consistentes con los que devuelve GET /api/v1/regulatory-coverage.
 */
export interface RegulationDetailHeader {
  regulationId: number
  code: string
  title: string
  type: string
  version: string
  status: string
  authority: RegulatoryAuthorityInfo
  evaluableClauses: number
  coveredTotal: number
  coveredPartial: number
  uncovered: number
  coveragePercentage: number | null
}

/** Respuesta completa de GET /api/v1/regulatory-coverage/:regulationId. */
export interface RegulationDetailResponse {
  regulation: RegulationDetailHeader
  clauses: RegulationClauseDetail[]
}

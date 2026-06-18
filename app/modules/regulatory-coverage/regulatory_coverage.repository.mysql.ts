import db from '@adonisjs/lucid/services/db'
import type { RegulatoryCoverageRepository } from './regulatory_coverage.repository.js'
import type {
  RegulationCoverageRow,
  RegulatoryCoverageSummaryResponse,
  RegulationDetailResponse,
  RegulationDetailHeader,
} from './dto/regulatory_coverage.dto.js'
import {
  aggregateLeafRows,
  buildRegulationCoverageRows,
  aggregateBucketLeafRows,
  buildRegulationSummaryRows,
  buildSummaryAggregate,
  buildClauseDetails,
  computeCoveragePercentage,
  type LeafClauseRow,
  type LeafClauseBucketRow,
  type VigentRegulationRow,
  type ClauseFeatureRawRow,
} from './regulatory_coverage.calculations.js'

/**
 * Implementación MySQL del repositorio de cobertura regulatoria.
 *
 * Resuelve el cálculo completo en dos consultas agregadas para evitar N+1:
 *
 * 1. `fetchVigentRegulations` — trae todas las normas vigentes con datos
 *    de su autoridad regulatoria.
 *
 * 2. `fetchLeafClauseCoverage` — una sola consulta que:
 *    a. Identifica los numerales hoja (cláusulas que no son padre de ninguna otra).
 *    b. Para cada numeral hoja, determina la mejor cobertura disponible
 *       considerando únicamente features con systemFeatureStatus = 'disponible'.
 *    c. Devuelve una fila por numeral hoja con (regulationId, bestCoverage).
 *
 * El service agrega los conteos por norma y calcula el porcentaje.
 */
export default class RegulatoryCoverageRepositoryMysql implements RegulatoryCoverageRepository {
  async getCoverageByRegulation(): Promise<RegulationCoverageRow[]> {
    const [regulations, leafRows] = await Promise.all([
      this.fetchVigentRegulations(),
      this.fetchLeafClauseCoverage(),
    ])

    const countsByRegulation = aggregateLeafRows(leafRows)
    return buildRegulationCoverageRows(regulations, countsByRegulation)
  }

  async getRegulationDetail(regulationId: number): Promise<RegulationDetailResponse | null> {
    const reg = await this.fetchVigentRegulationById(regulationId)
    if (!reg) return null

    const rawRows = await this.fetchLeafClausesWithFeatures(regulationId)
    const { clauses, counts } = buildClauseDetails(rawRows)

    const regulation: RegulationDetailHeader = {
      regulationId: reg.regulation_id,
      code: reg.regulation_code,
      title: reg.regulation_title,
      type: reg.regulation_type,
      version: reg.regulation_version,
      status: reg.regulation_status,
      authority: {
        slug: reg.authority_slug,
        shortName: reg.authority_short_name,
      },
      evaluableClauses: counts.evaluableClauses,
      coveredTotal: counts.coveredTotal,
      coveredPartial: counts.coveredPartial,
      uncovered: counts.uncovered,
      coveragePercentage: computeCoveragePercentage(counts),
    }

    return { regulation, clauses }
  }

  async getCoverageSummary(): Promise<RegulatoryCoverageSummaryResponse> {
    const [regulations, leafRows] = await Promise.all([
      this.fetchVigentRegulations(),
      this.fetchLeafClauseCoverageBuckets(),
    ])

    const countsByRegulation = aggregateBucketLeafRows(leafRows)
    return {
      aggregate: buildSummaryAggregate(regulations, countsByRegulation),
      regulations: buildRegulationSummaryRows(regulations, countsByRegulation),
    }
  }

  /**
   * Trae una norma vigente por su ID junto con los datos de su autoridad.
   * Devuelve `null` si la norma no existe, está soft-deleted o no está vigente.
   */
  private async fetchVigentRegulationById(regulationId: number): Promise<VigentRegulationRow | null> {
    const row = await db
      .from('regulations as r')
      .join('regulatory_authorities as ra', 'ra.regulatory_authority_id', 'r.regulatory_authority_id')
      .whereNull('r.deleted_at')
      .where('r.regulation_status', 'vigente')
      .where('r.regulation_id', regulationId)
      .select(
        'r.regulation_id',
        'r.regulation_code',
        'r.regulation_title',
        'r.regulation_type',
        'r.regulation_version',
        'r.regulation_status',
        'ra.regulatory_authority_slug as authority_slug',
        'ra.regulatory_authority_short_name as authority_short_name'
      )
      .first()

    return (row as VigentRegulationRow | null) ?? null
  }

  /**
   * Trae todos los numerales hoja de una norma vigente con sus features mapeadas.
   *
   * Devuelve una fila por par (numeral hoja × feature no-deprecada). Si un
   * numeral no tiene features mapeadas o todas son deprecadas, aparece una
   * sola fila con los campos de feature y módulo en null.
   *
   * La columna `system_module_deleted_at` es el soft-delete de `system_modules`
   * (nombre de columna no estándar declarado en el modelo SystemModule).
   */
  private async fetchLeafClausesWithFeatures(regulationId: number): Promise<ClauseFeatureRawRow[]> {
    const sql = `
      SELECT
        lc.regulation_clause_id,
        lc.regulation_clause_code,
        lc.regulation_clause_title_key,
        lc.regulation_clause_obligation_key,
        lc.regulation_clause_explanation_key,
        rcf.regulation_clause_feature_coverage,
        sf.system_feature_id,
        sf.system_feature_name,
        sf.system_feature_slug,
        sf.system_feature_status,
        sm.system_module_id,
        sm.system_module_name,
        sm.system_module_slug
      FROM regulation_clauses AS lc
      INNER JOIN regulations AS r
        ON  r.regulation_id  = lc.regulation_id
        AND r.regulation_status = 'vigente'
        AND r.deleted_at IS NULL
      LEFT JOIN regulation_clause_features AS rcf
        ON  rcf.regulation_clause_id = lc.regulation_clause_id
        AND rcf.deleted_at IS NULL
      LEFT JOIN system_features AS sf
        ON  sf.system_feature_id = rcf.system_feature_id
        AND sf.deleted_at IS NULL
        AND sf.system_feature_status != 'deprecado'
      LEFT JOIN system_modules AS sm
        ON  sm.system_module_id = sf.system_module_id
        AND sm.system_module_deleted_at IS NULL
      WHERE
        lc.regulation_id = ?
        AND lc.deleted_at IS NULL
        AND lc.regulation_clause_id NOT IN (
          SELECT DISTINCT parent_regulation_clause_id
          FROM   regulation_clauses
          WHERE  parent_regulation_clause_id IS NOT NULL
            AND  deleted_at IS NULL
        )
      ORDER BY lc.regulation_clause_ord, lc.regulation_clause_id, sf.system_feature_id
    `

    const result = await db.rawQuery(sql, [regulationId])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = Array.isArray(result) ? (result[0] as any[]) : (result as any[])
    return rows as ClauseFeatureRawRow[]
  }

  /**
   * Trae todas las normas con estatus `vigente` junto con los datos de su autoridad.
   * Excluye normas con soft-delete.
   */
  private async fetchVigentRegulations(): Promise<VigentRegulationRow[]> {
    return db
      .from('regulations as r')
      .join('regulatory_authorities as ra', 'ra.regulatory_authority_id', 'r.regulatory_authority_id')
      .whereNull('r.deleted_at')
      .where('r.regulation_status', 'vigente')
      .select(
        'r.regulation_id',
        'r.regulation_code',
        'r.regulation_title',
        'r.regulation_type',
        'r.regulation_version',
        'r.regulation_status',
        'ra.regulatory_authority_slug as authority_slug',
        'ra.regulatory_authority_short_name as authority_short_name'
      )
      .orderBy('r.regulation_id')
  }

  /**
   * Identifica los numerales hoja de todas las normas vigentes y determina
   * la mejor cobertura disponible para cada uno.
   *
   * Un numeral hoja es una cláusula cuyo `regulation_clause_id` no aparece
   * como `parent_regulation_clause_id` de ninguna otra cláusula (excluyendo
   * soft-deleted).
   *
   * Para cada numeral hoja se evalúan los mapeos en `regulation_clause_features`
   * cuya feature (`system_features`) tenga `system_feature_status = 'disponible'`.
   * La cobertura se agrega con MAX sobre la jerarquía: 'total' > 'parcial' > null.
   *
   * Retorna una fila por numeral hoja con:
   *   - regulation_id
   *   - best_coverage: 'total' | 'parcial' | null
   */
  private async fetchLeafClauseCoverage(): Promise<LeafClauseRow[]> {
    /*
     * La consulta tiene tres partes:
     *
     * 1. `parent_ids`: subconsulta que colecta todos los clause_id que son padre
     *    de al menos otro numeral (excluyendo soft-deleted). Los que no están en
     *    esta lista son "hoja".
     *
     * 2. `leaf_clauses`: filtra las cláusulas que no están en `parent_ids`,
     *    pertenecen a normas vigentes y no tienen soft-delete.
     *
     * 3. LEFT JOIN con `regulation_clause_features` y `system_features` para
     *    obtener el mejor coverage disponible (features con status 'disponible').
     *    Se usa MAX con FIELD() para obtener la jerarquía total > parcial > null.
     */
    const sql = `
      SELECT
        lc.regulation_id,
        CASE
          WHEN MAX(
            CASE
              WHEN sf.system_feature_status = 'disponible'
                   AND rcf.regulation_clause_feature_coverage = 'total'  THEN 2
              WHEN sf.system_feature_status = 'disponible'
                   AND rcf.regulation_clause_feature_coverage = 'parcial' THEN 1
              ELSE 0
            END
          ) = 2 THEN 'total'
          WHEN MAX(
            CASE
              WHEN sf.system_feature_status = 'disponible'
                   AND rcf.regulation_clause_feature_coverage = 'total'  THEN 2
              WHEN sf.system_feature_status = 'disponible'
                   AND rcf.regulation_clause_feature_coverage = 'parcial' THEN 1
              ELSE 0
            END
          ) = 1 THEN 'parcial'
          ELSE NULL
        END AS best_coverage
      FROM regulation_clauses AS lc
      INNER JOIN regulations AS r
        ON  r.regulation_id  = lc.regulation_id
        AND r.regulation_status = 'vigente'
        AND r.deleted_at IS NULL
      LEFT JOIN regulation_clause_features AS rcf
        ON  rcf.regulation_clause_id = lc.regulation_clause_id
        AND rcf.deleted_at IS NULL
      LEFT JOIN system_features AS sf
        ON  sf.system_feature_id = rcf.system_feature_id
        AND sf.deleted_at IS NULL
        AND sf.system_feature_status = 'disponible'
      WHERE
        lc.deleted_at IS NULL
        AND lc.regulation_clause_id NOT IN (
          SELECT DISTINCT parent_regulation_clause_id
          FROM   regulation_clauses
          WHERE  parent_regulation_clause_id IS NOT NULL
            AND  deleted_at IS NULL
        )
      GROUP BY lc.regulation_clause_id, lc.regulation_id
    `

    const result = await db.rawQuery(sql)
    // mysql2 devuelve [rows, fields]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = Array.isArray(result) ? (result[0] as any[]) : (result as any[])
    return rows as LeafClauseRow[]
  }

  /**
   * Variante de `fetchLeafClauseCoverage` para el summary.
   *
   * Devuelve una fila por numeral hoja con tres columnas de mejor cobertura,
   * una por bucket acumulativo:
   *
   * - `best_coverage_disponible`   : solo features con status `disponible`.
   * - `best_coverage_en_desarrollo`: features con status `disponible` o `en_desarrollo`.
   * - `best_coverage_planeado`     : features con status `disponible`, `en_desarrollo` o `planeado`.
   *
   * Las features con status `deprecado` quedan fuera del JOIN, de modo que no
   * contribuyen a ningún bucket. El criterio de numerales hoja y el join con
   * normas vigentes es idéntico al de `fetchLeafClauseCoverage`.
   */
  private async fetchLeafClauseCoverageBuckets(): Promise<LeafClauseBucketRow[]> {
    const sql = `
      SELECT
        lc.regulation_id,
        CASE
          WHEN MAX(
            CASE
              WHEN sf.system_feature_status = 'disponible'
                   AND rcf.regulation_clause_feature_coverage = 'total'  THEN 2
              WHEN sf.system_feature_status = 'disponible'
                   AND rcf.regulation_clause_feature_coverage = 'parcial' THEN 1
              ELSE 0
            END
          ) = 2 THEN 'total'
          WHEN MAX(
            CASE
              WHEN sf.system_feature_status = 'disponible'
                   AND rcf.regulation_clause_feature_coverage = 'total'  THEN 2
              WHEN sf.system_feature_status = 'disponible'
                   AND rcf.regulation_clause_feature_coverage = 'parcial' THEN 1
              ELSE 0
            END
          ) = 1 THEN 'parcial'
          ELSE NULL
        END AS best_coverage_disponible,
        CASE
          WHEN MAX(
            CASE
              WHEN sf.system_feature_status IN ('disponible', 'en_desarrollo')
                   AND rcf.regulation_clause_feature_coverage = 'total'  THEN 2
              WHEN sf.system_feature_status IN ('disponible', 'en_desarrollo')
                   AND rcf.regulation_clause_feature_coverage = 'parcial' THEN 1
              ELSE 0
            END
          ) = 2 THEN 'total'
          WHEN MAX(
            CASE
              WHEN sf.system_feature_status IN ('disponible', 'en_desarrollo')
                   AND rcf.regulation_clause_feature_coverage = 'total'  THEN 2
              WHEN sf.system_feature_status IN ('disponible', 'en_desarrollo')
                   AND rcf.regulation_clause_feature_coverage = 'parcial' THEN 1
              ELSE 0
            END
          ) = 1 THEN 'parcial'
          ELSE NULL
        END AS best_coverage_en_desarrollo,
        CASE
          WHEN MAX(
            CASE
              WHEN sf.system_feature_status IN ('disponible', 'en_desarrollo', 'planeado')
                   AND rcf.regulation_clause_feature_coverage = 'total'  THEN 2
              WHEN sf.system_feature_status IN ('disponible', 'en_desarrollo', 'planeado')
                   AND rcf.regulation_clause_feature_coverage = 'parcial' THEN 1
              ELSE 0
            END
          ) = 2 THEN 'total'
          WHEN MAX(
            CASE
              WHEN sf.system_feature_status IN ('disponible', 'en_desarrollo', 'planeado')
                   AND rcf.regulation_clause_feature_coverage = 'total'  THEN 2
              WHEN sf.system_feature_status IN ('disponible', 'en_desarrollo', 'planeado')
                   AND rcf.regulation_clause_feature_coverage = 'parcial' THEN 1
              ELSE 0
            END
          ) = 1 THEN 'parcial'
          ELSE NULL
        END AS best_coverage_planeado
      FROM regulation_clauses AS lc
      INNER JOIN regulations AS r
        ON  r.regulation_id  = lc.regulation_id
        AND r.regulation_status = 'vigente'
        AND r.deleted_at IS NULL
      LEFT JOIN regulation_clause_features AS rcf
        ON  rcf.regulation_clause_id = lc.regulation_clause_id
        AND rcf.deleted_at IS NULL
      LEFT JOIN system_features AS sf
        ON  sf.system_feature_id = rcf.system_feature_id
        AND sf.deleted_at IS NULL
        AND sf.system_feature_status != 'deprecado'
      WHERE
        lc.deleted_at IS NULL
        AND lc.regulation_clause_id NOT IN (
          SELECT DISTINCT parent_regulation_clause_id
          FROM   regulation_clauses
          WHERE  parent_regulation_clause_id IS NOT NULL
            AND  deleted_at IS NULL
        )
      GROUP BY lc.regulation_clause_id, lc.regulation_id
    `

    const result = await db.rawQuery(sql)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = Array.isArray(result) ? (result[0] as any[]) : (result as any[])
    return rows as LeafClauseBucketRow[]
  }
}

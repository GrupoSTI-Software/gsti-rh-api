import type {
  RegulationCoverageRow,
  CoverageBucketPercentages,
  RegulationSummaryRow,
  SummaryAggregate,
  ClauseFeatureDetail,
  RegulationClauseDetail,
} from './dto/regulatory_coverage.dto.js'

/** Conteos de numerales hoja por norma. */
export interface CoverageCounts {
  evaluableClauses: number
  coveredTotal: number
  coveredPartial: number
  uncovered: number
}

/** Fila cruda de un numeral hoja devuelta por la consulta SQL. */
export interface LeafClauseRow {
  regulation_id: number
  best_coverage: 'total' | 'parcial' | null
}

/** Metadatos de una norma vigente devueltos por la consulta SQL. */
export interface VigentRegulationRow {
  regulation_id: number
  regulation_code: string
  regulation_title: string
  regulation_type: string
  regulation_version: string
  regulation_status: string
  authority_slug: string
  authority_short_name: string
}

export function emptyCoverageCounts(): CoverageCounts {
  return {
    evaluableClauses: 0,
    coveredTotal: 0,
    coveredPartial: 0,
    uncovered: 0,
  }
}

/**
 * Acumula un numeral hoja en los conteos de su norma según su mejor cobertura.
 */
export function applyLeafRow(counts: CoverageCounts, bestCoverage: 'total' | 'parcial' | null): CoverageCounts {
  const next = { ...counts, evaluableClauses: counts.evaluableClauses + 1 }

  if (bestCoverage === 'total') {
    next.coveredTotal += 1
  } else if (bestCoverage === 'parcial') {
    next.coveredPartial += 1
  } else {
    next.uncovered += 1
  }

  return next
}

/**
 * Agrupa filas de numerales hoja por regulation_id y acumula conteos.
 */
export function aggregateLeafRows(leafRows: LeafClauseRow[]): Map<number, CoverageCounts> {
  const countsByRegulation = new Map<number, CoverageCounts>()

  for (const row of leafRows) {
    const existing = countsByRegulation.get(row.regulation_id) ?? emptyCoverageCounts()
    countsByRegulation.set(row.regulation_id, applyLeafRow(existing, row.best_coverage))
  }

  return countsByRegulation
}

/**
 * Calcula el porcentaje ponderado de cobertura.
 * Retorna null cuando no hay numerales hoja evaluables.
 */
export function computeCoveragePercentage(counts: CoverageCounts): number | null {
  if (counts.evaluableClauses === 0) {
    return null
  }

  return (
    Math.round(
      ((counts.coveredTotal * 1.0 + counts.coveredPartial * 0.5) / counts.evaluableClauses) * 1000
    ) / 10
  )
}

/**
 * Construye la fila de respuesta de cobertura para una norma vigente.
 */
export function buildRegulationCoverageRow(
  reg: VigentRegulationRow,
  counts: CoverageCounts
): RegulationCoverageRow {
  return {
    regulationId: reg.regulation_id,
    regulationCode: reg.regulation_code,
    regulationTitle: reg.regulation_title,
    regulationType: reg.regulation_type,
    regulationVersion: reg.regulation_version,
    regulationStatus: reg.regulation_status,
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
}

/**
 * Combina normas vigentes con sus conteos agregados de numerales hoja.
 */
export function buildRegulationCoverageRows(
  regulations: VigentRegulationRow[],
  countsByRegulation: Map<number, CoverageCounts>
): RegulationCoverageRow[] {
  return regulations.map((reg) => {
    const counts = countsByRegulation.get(reg.regulation_id) ?? emptyCoverageCounts()
    return buildRegulationCoverageRow(reg, counts)
  })
}

// ─── Summary: buckets acumulativos (disponible / en_desarrollo / planeado) ───

/**
 * Fila cruda de un numeral hoja con su mejor cobertura por bucket acumulativo,
 * devuelta por la consulta SQL del summary.
 *
 * Cada columna representa el mejor coverage disponible considerando todos los
 * statuses incluidos en ese bucket (el de `planeado` siempre es >= `enDesarrollo`
 * que a su vez es >= `disponible`).
 */
export interface LeafClauseBucketRow {
  regulation_id: number
  best_coverage_disponible: 'total' | 'parcial' | null
  best_coverage_en_desarrollo: 'total' | 'parcial' | null
  best_coverage_planeado: 'total' | 'parcial' | null
}

/** Subconteo de numerales hoja cubiertos para un bucket. */
export interface BucketCount {
  coveredTotal: number
  coveredPartial: number
}

/** Conteos de numerales hoja por norma desglosados por los tres buckets. */
export interface BucketCoverageCounts {
  evaluableClauses: number
  disponible: BucketCount
  enDesarrollo: BucketCount
  planeado: BucketCount
}

/** Conteo vacío de un bucket individual. */
function emptyBucketCount(): BucketCount {
  return { coveredTotal: 0, coveredPartial: 0 }
}

/** Conteos vacíos para los tres buckets de una norma. */
export function emptyBucketCoverageCounts(): BucketCoverageCounts {
  return {
    evaluableClauses: 0,
    disponible: emptyBucketCount(),
    enDesarrollo: emptyBucketCount(),
    planeado: emptyBucketCount(),
  }
}

/** Acumula una cobertura en un subconteo de bucket. */
function applyBucketCount(bucket: BucketCount, coverage: 'total' | 'parcial' | null): BucketCount {
  if (coverage === 'total') return { ...bucket, coveredTotal: bucket.coveredTotal + 1 }
  if (coverage === 'parcial') return { ...bucket, coveredPartial: bucket.coveredPartial + 1 }
  return bucket
}

/**
 * Acumula un numeral hoja en los conteos de su norma para los tres buckets.
 */
export function applyBucketLeafRow(
  counts: BucketCoverageCounts,
  row: LeafClauseBucketRow
): BucketCoverageCounts {
  return {
    evaluableClauses: counts.evaluableClauses + 1,
    disponible: applyBucketCount(counts.disponible, row.best_coverage_disponible),
    enDesarrollo: applyBucketCount(counts.enDesarrollo, row.best_coverage_en_desarrollo),
    planeado: applyBucketCount(counts.planeado, row.best_coverage_planeado),
  }
}

/**
 * Agrupa filas de numerales hoja por regulation_id y acumula los conteos por bucket.
 */
export function aggregateBucketLeafRows(
  leafRows: LeafClauseBucketRow[]
): Map<number, BucketCoverageCounts> {
  const countsByRegulation = new Map<number, BucketCoverageCounts>()

  for (const row of leafRows) {
    const existing = countsByRegulation.get(row.regulation_id) ?? emptyBucketCoverageCounts()
    countsByRegulation.set(row.regulation_id, applyBucketLeafRow(existing, row))
  }

  return countsByRegulation
}

/**
 * Calcula el porcentaje ponderado para un bucket dado el denominador global.
 * Reutiliza la misma fórmula de `computeCoveragePercentage`.
 */
function computeBucketPercentage(
  evaluableClauses: number,
  bucket: BucketCount
): number | null {
  return computeCoveragePercentage({
    evaluableClauses,
    coveredTotal: bucket.coveredTotal,
    coveredPartial: bucket.coveredPartial,
    uncovered: evaluableClauses - bucket.coveredTotal - bucket.coveredPartial,
  })
}

/**
 * Deriva los tres porcentajes de cobertura por bucket para unos conteos dados.
 * Retorna `null` en cada bucket cuando `evaluableClauses` es 0.
 */
export function computeCoverageBucketPercentages(
  counts: BucketCoverageCounts
): CoverageBucketPercentages {
  if (counts.evaluableClauses === 0) {
    return { disponible: null, enDesarrollo: null, planeado: null }
  }

  return {
    disponible: computeBucketPercentage(counts.evaluableClauses, counts.disponible),
    enDesarrollo: computeBucketPercentage(counts.evaluableClauses, counts.enDesarrollo),
    planeado: computeBucketPercentage(counts.evaluableClauses, counts.planeado),
  }
}

/**
 * Construye la fila de summary para una norma vigente.
 */
export function buildRegulationSummaryRow(
  reg: VigentRegulationRow,
  counts: BucketCoverageCounts
): RegulationSummaryRow {
  return {
    regulationId: reg.regulation_id,
    regulationCode: reg.regulation_code,
    regulationTitle: reg.regulation_title,
    regulationVersion: reg.regulation_version,
    authority: {
      slug: reg.authority_slug,
      shortName: reg.authority_short_name,
    },
    evaluableClauses: counts.evaluableClauses,
    coveragePercentage: computeCoverageBucketPercentages(counts),
  }
}

/**
 * Combina normas vigentes con sus conteos por bucket y construye el array del summary.
 */
export function buildRegulationSummaryRows(
  regulations: VigentRegulationRow[],
  countsByRegulation: Map<number, BucketCoverageCounts>
): RegulationSummaryRow[] {
  return regulations.map((reg) => {
    const counts = countsByRegulation.get(reg.regulation_id) ?? emptyBucketCoverageCounts()
    return buildRegulationSummaryRow(reg, counts)
  })
}

// ─── Detalle por norma (GET /api/v1/regulatory-coverage/:regulationId) ──────

/**
 * Fila cruda que devuelve la consulta SQL del detalle por norma.
 * Una fila por cada par (numeral hoja × feature no-deprecada).
 * Cuando un numeral hoja no tiene features mapeadas o todas son deprecadas,
 * se devuelve una sola fila con todos los campos de feature y módulo en null.
 */
export interface ClauseFeatureRawRow {
  regulation_clause_id: number
  regulation_clause_code: string
  regulation_clause_title_key: string | null
  regulation_clause_obligation_key: string
  regulation_clause_explanation_key: string
  regulation_clause_feature_coverage: 'total' | 'parcial' | null
  system_feature_id: number | null
  system_feature_name: string | null
  system_feature_slug: string | null
  system_feature_status: string | null
  system_module_id: number | null
  system_module_name: string | null
  system_module_slug: string | null
}

/**
 * Agrega las filas crudas del detalle en un arreglo de `RegulationClauseDetail`
 * y calcula los conteos de cobertura para el header de la norma.
 *
 * Reglas:
 * - `bestCoverage` de cada numeral se calcula solo sobre features `disponible`.
 * - `features` incluye todas las features no-deprecadas (disponible + en_desarrollo + planeado).
 * - Features cuyo módulo fue soft-deleted quedan excluidas (ambas columnas de módulo son null).
 * - El orden de los numerales respeta el que llegó en `rawRows` (ORDER BY en SQL).
 */
export function buildClauseDetails(rawRows: ClauseFeatureRawRow[]): {
  clauses: RegulationClauseDetail[]
  counts: CoverageCounts
} {
  type ClauseAccumulator = {
    code: string
    titleKey: string | null
    obligationKey: string
    explanationKey: string
    featureRows: ClauseFeatureRawRow[]
  }

  const clauseMap = new Map<number, ClauseAccumulator>()

  for (const row of rawRows) {
    if (!clauseMap.has(row.regulation_clause_id)) {
      clauseMap.set(row.regulation_clause_id, {
        code: row.regulation_clause_code,
        titleKey: row.regulation_clause_title_key,
        obligationKey: row.regulation_clause_obligation_key,
        explanationKey: row.regulation_clause_explanation_key,
        featureRows: [],
      })
    }
    if (row.system_feature_id !== null && row.system_module_id !== null) {
      clauseMap.get(row.regulation_clause_id)!.featureRows.push(row)
    }
  }

  const clauses: RegulationClauseDetail[] = []
  const counts = emptyCoverageCounts()

  for (const [clauseId, data] of clauseMap) {
    let best: 'total' | 'parcial' | null = null

    for (const fr of data.featureRows) {
      if (fr.system_feature_status === 'disponible') {
        if (fr.regulation_clause_feature_coverage === 'total') {
          best = 'total'
          break
        }
        if (fr.regulation_clause_feature_coverage === 'parcial' && best === null) {
          best = 'parcial'
        }
      }
    }

    const features: ClauseFeatureDetail[] = data.featureRows.map((fr) => ({
      systemFeatureId: fr.system_feature_id!,
      featureName: fr.system_feature_name ?? '',
      featureSlug: fr.system_feature_slug ?? '',
      featureStatus: fr.system_feature_status as 'planeado' | 'en_desarrollo' | 'disponible',
      coverage: fr.regulation_clause_feature_coverage,
      module: {
        moduleId: fr.system_module_id!,
        moduleName: fr.system_module_name ?? '',
        moduleSlug: fr.system_module_slug ?? '',
      },
    }))

    clauses.push({
      regulationClauseId: clauseId,
      code: data.code,
      titleKey: data.titleKey,
      obligationKey: data.obligationKey,
      explanationKey: data.explanationKey,
      bestCoverage: best,
      features,
    })

    counts.evaluableClauses++
    if (best === 'total') counts.coveredTotal++
    else if (best === 'parcial') counts.coveredPartial++
    else counts.uncovered++
  }

  return { clauses, counts }
}

/**
 * Calcula el agregado cross-norma sumando los conteos de todas las normas vigentes.
 *
 * Las normas sin numerales hoja (evaluableClauses = 0) contribuyen con cero
 * al denominador, por lo que no afectan el cálculo.
 */
export function buildSummaryAggregate(
  regulations: VigentRegulationRow[],
  countsByRegulation: Map<number, BucketCoverageCounts>
): SummaryAggregate {
  let evaluableClauses = 0
  const disponible: BucketCount = { coveredTotal: 0, coveredPartial: 0 }
  const enDesarrollo: BucketCount = { coveredTotal: 0, coveredPartial: 0 }
  const planeado: BucketCount = { coveredTotal: 0, coveredPartial: 0 }

  for (const reg of regulations) {
    const counts = countsByRegulation.get(reg.regulation_id) ?? emptyBucketCoverageCounts()
    evaluableClauses += counts.evaluableClauses
    disponible.coveredTotal += counts.disponible.coveredTotal
    disponible.coveredPartial += counts.disponible.coveredPartial
    enDesarrollo.coveredTotal += counts.enDesarrollo.coveredTotal
    enDesarrollo.coveredPartial += counts.enDesarrollo.coveredPartial
    planeado.coveredTotal += counts.planeado.coveredTotal
    planeado.coveredPartial += counts.planeado.coveredPartial
  }

  const aggregateCounts: BucketCoverageCounts = { evaluableClauses, disponible, enDesarrollo, planeado }

  return {
    evaluableClauses,
    coveragePercentage: computeCoverageBucketPercentages(aggregateCounts),
  }
}

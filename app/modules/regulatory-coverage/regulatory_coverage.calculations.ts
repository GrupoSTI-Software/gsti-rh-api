import type { RegulationCoverageRow } from './dto/regulatory_coverage.dto.js'

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

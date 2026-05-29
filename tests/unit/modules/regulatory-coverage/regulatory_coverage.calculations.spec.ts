import { test } from '@japa/runner'
import {
  aggregateLeafRows,
  applyLeafRow,
  buildRegulationCoverageRow,
  buildRegulationCoverageRows,
  computeCoveragePercentage,
  emptyCoverageCounts,
  type VigentRegulationRow,
} from '../../../../app/modules/regulatory-coverage/regulatory_coverage.calculations.js'

function makeRegulation(overrides: Partial<VigentRegulationRow> = {}): VigentRegulationRow {
  return {
    regulation_id: 1,
    regulation_code: 'NOM-035-STPS',
    regulation_title: 'Factores de Riesgo en el Trabajo',
    regulation_type: 'NOM',
    regulation_version: '2018',
    regulation_status: 'vigente',
    authority_slug: 'stps',
    authority_short_name: 'STPS',
    ...overrides,
  }
}

test.group('RegulatoryCoverage — cálculo de cobertura', () => {
  test('computeCoveragePercentage aplica la fórmula ponderada y redondea a 1 decimal', ({
    assert,
  }) => {
    const percentage = computeCoveragePercentage({
      evaluableClauses: 35,
      coveredTotal: 12,
      coveredPartial: 8,
      uncovered: 15,
    })

    assert.equal(percentage, 45.7)
  })

  test('computeCoveragePercentage retorna null cuando evaluableClauses es 0', ({ assert }) => {
    const percentage = computeCoveragePercentage(emptyCoverageCounts())
    assert.isNull(percentage)
  })

  test('computeCoveragePercentage es 100 cuando todos los numerales hoja son total', ({
    assert,
  }) => {
    const percentage = computeCoveragePercentage({
      evaluableClauses: 4,
      coveredTotal: 4,
      coveredPartial: 0,
      uncovered: 0,
    })

    assert.equal(percentage, 100)
  })

  test('computeCoveragePercentage es 50 cuando todos los numerales hoja son parcial', ({
    assert,
  }) => {
    const percentage = computeCoveragePercentage({
      evaluableClauses: 4,
      coveredTotal: 0,
      coveredPartial: 4,
      uncovered: 0,
    })

    assert.equal(percentage, 50)
  })

  test('computeCoveragePercentage es 0 cuando ningún numeral hoja tiene cobertura', ({
    assert,
  }) => {
    const percentage = computeCoveragePercentage({
      evaluableClauses: 10,
      coveredTotal: 0,
      coveredPartial: 0,
      uncovered: 10,
    })

    assert.equal(percentage, 0)
  })

  test('applyLeafRow clasifica total, parcial y sin cobertura', ({ assert }) => {
    let counts = emptyCoverageCounts()

    counts = applyLeafRow(counts, 'total')
    counts = applyLeafRow(counts, 'parcial')
    counts = applyLeafRow(counts, null)

    assert.equal(counts.evaluableClauses, 3)
    assert.equal(counts.coveredTotal, 1)
    assert.equal(counts.coveredPartial, 1)
    assert.equal(counts.uncovered, 1)
  })

  test('aggregateLeafRows agrupa numerales hoja por norma', ({ assert }) => {
    const map = aggregateLeafRows([
      { regulation_id: 1, best_coverage: 'total' },
      { regulation_id: 1, best_coverage: 'parcial' },
      { regulation_id: 2, best_coverage: null },
    ])

    const reg1 = map.get(1)
    const reg2 = map.get(2)

    assert.exists(reg1)
    assert.exists(reg2)
    assert.equal(reg1!.evaluableClauses, 2)
    assert.equal(reg1!.coveredTotal, 1)
    assert.equal(reg1!.coveredPartial, 1)
    assert.equal(reg1!.uncovered, 0)
    assert.equal(reg2!.evaluableClauses, 1)
    assert.equal(reg2!.uncovered, 1)
  })

  test('coveredTotal + coveredPartial + uncovered suman evaluableClauses', ({ assert }) => {
    const map = aggregateLeafRows([
      { regulation_id: 1, best_coverage: 'total' },
      { regulation_id: 1, best_coverage: 'total' },
      { regulation_id: 1, best_coverage: 'parcial' },
      { regulation_id: 1, best_coverage: null },
      { regulation_id: 1, best_coverage: null },
    ])

    const counts = map.get(1)!
    assert.equal(
      counts.coveredTotal + counts.coveredPartial + counts.uncovered,
      counts.evaluableClauses
    )
  })

  test('buildRegulationCoverageRow expone solo los campos del contrato', ({ assert }) => {
    const row = buildRegulationCoverageRow(makeRegulation(), {
      evaluableClauses: 35,
      coveredTotal: 12,
      coveredPartial: 8,
      uncovered: 15,
    })

    assert.equal(row.regulationCode, 'NOM-035-STPS')
    assert.equal(row.regulationStatus, 'vigente')
    assert.deepEqual(row.authority, { slug: 'stps', shortName: 'STPS' })
    assert.equal(row.evaluableClauses, 35)
    assert.equal(row.coveragePercentage, 45.7)
    assert.notProperty(row, 'regulationInternalNotes')
    assert.notProperty(row, 'regulationScopeDescriptionKey')
  })

  test('norma vigente sin numerales hoja devuelve evaluableClauses 0 y coveragePercentage null', ({
    assert,
  }) => {
    const rows = buildRegulationCoverageRows([makeRegulation({ regulation_id: 99 })], new Map())

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].evaluableClauses, 0)
    assert.equal(rows[0].coveredTotal, 0)
    assert.equal(rows[0].coveredPartial, 0)
    assert.equal(rows[0].uncovered, 0)
    assert.isNull(rows[0].coveragePercentage)
  })

  test('buildRegulationCoverageRows incluye normas vigentes aunque no tengan numerales hoja', ({
    assert,
  }) => {
    const regulations = [
      makeRegulation({ regulation_id: 1, regulation_code: 'NOM-035-STPS' }),
      makeRegulation({ regulation_id: 2, regulation_code: 'NOM-037-STPS' }),
    ]

    const counts = aggregateLeafRows([{ regulation_id: 1, best_coverage: 'total' }])
    const rows = buildRegulationCoverageRows(regulations, counts)

    assert.lengthOf(rows, 2)
    assert.equal(rows[0].coveredTotal, 1)
    assert.equal(rows[1].evaluableClauses, 0)
    assert.isNull(rows[1].coveragePercentage)
  })
})

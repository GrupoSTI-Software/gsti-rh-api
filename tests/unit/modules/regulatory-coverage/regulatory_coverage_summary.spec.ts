import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import {
  aggregateBucketLeafRows,
  aggregateLeafRows,
  applyBucketLeafRow,
  buildRegulationCoverageRow,
  buildRegulationSummaryRow,
  buildRegulationSummaryRows,
  buildSummaryAggregate,
  computeCoverageBucketPercentages,
  computeCoveragePercentage,
  emptyBucketCoverageCounts,
  type LeafClauseBucketRow,
  type VigentRegulationRow,
} from '../../../../app/modules/regulatory-coverage/regulatory_coverage.calculations.js'
import {
  runRegulatoryCoverageSummary,
} from '../../../../app/modules/regulatory-coverage/regulatory_coverage.controller.js'
import RegulatoryCoverageService from '../../../../app/modules/regulatory-coverage/regulatory_coverage.service.js'
import type { RegulatoryCoverageRepository } from '../../../../app/modules/regulatory-coverage/regulatory_coverage.repository.js'
import type {
  RegulationCoverageRow,
  RegulatoryCoverageSummaryResponse,
} from '../../../../app/modules/regulatory-coverage/dto/regulatory_coverage.dto.js'

const FEATURE = 'USRH1780517051078-cobertura-agregada-proyectada'

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

const sampleSummary: RegulatoryCoverageSummaryResponse = {
  aggregate: {
    evaluableClauses: 80,
    coveragePercentage: { disponible: 43.8, enDesarrollo: 61.3, planeado: 78.1 },
  },
  regulations: [
    {
      regulationId: 1,
      regulationCode: 'NOM-035-STPS',
      regulationTitle: 'Factores de Riesgo en el Trabajo',
      regulationVersion: '2018',
      authority: { slug: 'stps', shortName: 'STPS' },
      evaluableClauses: 35,
      coveragePercentage: { disponible: 45.7, enDesarrollo: 62.9, planeado: 80 },
    },
  ],
}

function makeFullMockRepo(options: {
  coverageRows?: RegulationCoverageRow[]
  summary?: RegulatoryCoverageSummaryResponse
} = {}): {
  repo: RegulatoryCoverageRepository
  coverageCalls: number
  summaryCalls: number
} {
  let coverageCalls = 0
  let summaryCalls = 0

  const repo: RegulatoryCoverageRepository = {
    async getCoverageByRegulation() {
      coverageCalls += 1
      return options.coverageRows ?? []
    },
    async getCoverageSummary() {
      summaryCalls += 1
      return (
        options.summary ?? {
          aggregate: {
            evaluableClauses: 0,
            coveragePercentage: { disponible: null, enDesarrollo: null, planeado: null },
          },
          regulations: [],
        }
      )
    },
    async getRegulationDetail() {
      return null
    },
  }

  return {
    repo,
    get coverageCalls() {
      return coverageCalls
    },
    get summaryCalls() {
      return summaryCalls
    },
  }
}

interface CapturedResponse {
  status?: number
  body?: Record<string, unknown>
}

function makeHttpContext(options: { user?: object | null } = {}): {
  ctx: HttpContext
  captured: CapturedResponse
} {
  const captured: CapturedResponse = {}

  const response = {
    status(code: number) {
      captured.status = code
      return {
        json(body: Record<string, unknown>) {
          captured.body = body
          return body
        },
      }
    },
  }

  const ctx = {
    auth: { user: options.user ?? null },
    i18n: {
      formatMessage(key: string) {
        return key
      },
    },
    response,
  } as unknown as HttpContext

  return { ctx, captured }
}

test.group(`${FEATURE} — cálculos por bucket acumulativo`, () => {
  test('emptyBucketCoverageCounts inicia todos los conteos en cero', ({ assert }) => {
    const counts = emptyBucketCoverageCounts()

    assert.equal(counts.evaluableClauses, 0)
    assert.deepEqual(counts.disponible, { coveredTotal: 0, coveredPartial: 0 })
    assert.deepEqual(counts.enDesarrollo, { coveredTotal: 0, coveredPartial: 0 })
    assert.deepEqual(counts.planeado, { coveredTotal: 0, coveredPartial: 0 })
  })

  test('applyBucketLeafRow acumula cada bucket de forma independiente', ({ assert }) => {
    const counts = applyBucketLeafRow(emptyBucketCoverageCounts(), {
      regulation_id: 1,
      best_coverage_disponible: 'total',
      best_coverage_en_desarrollo: 'parcial',
      best_coverage_planeado: null,
    })

    assert.equal(counts.evaluableClauses, 1)
    assert.equal(counts.disponible.coveredTotal, 1)
    assert.equal(counts.disponible.coveredPartial, 0)
    assert.equal(counts.enDesarrollo.coveredTotal, 0)
    assert.equal(counts.enDesarrollo.coveredPartial, 1)
    assert.equal(counts.planeado.coveredTotal, 0)
    assert.equal(counts.planeado.coveredPartial, 0)
  })

  test('numeral solo en_desarrollo cuenta en enDesarrollo y planeado pero no en disponible', ({
    assert,
  }) => {
    const counts = applyBucketLeafRow(emptyBucketCoverageCounts(), {
      regulation_id: 1,
      best_coverage_disponible: null,
      best_coverage_en_desarrollo: 'total',
      best_coverage_planeado: 'total',
    })

    const percentages = computeCoverageBucketPercentages(counts)

    assert.equal(counts.disponible.coveredTotal + counts.disponible.coveredPartial, 0)
    assert.equal(counts.enDesarrollo.coveredTotal, 1)
    assert.equal(counts.planeado.coveredTotal, 1)
    assert.equal(percentages.disponible, 0)
    assert.equal(percentages.enDesarrollo, 100)
    assert.equal(percentages.planeado, 100)
  })

  test('numeral sin cobertura en ningún bucket (equivalente a deprecado fuera del JOIN)', ({
    assert,
  }) => {
    const counts = applyBucketLeafRow(emptyBucketCoverageCounts(), {
      regulation_id: 1,
      best_coverage_disponible: null,
      best_coverage_en_desarrollo: null,
      best_coverage_planeado: null,
    })

    assert.equal(counts.evaluableClauses, 1)
    assert.equal(
      counts.disponible.coveredTotal +
        counts.disponible.coveredPartial +
        counts.enDesarrollo.coveredTotal +
        counts.enDesarrollo.coveredPartial +
        counts.planeado.coveredTotal +
        counts.planeado.coveredPartial,
      0
    )
  })

  test('computeCoverageBucketPercentages aplica fórmula ponderada por bucket (33.3 / 50 / 66.7)', ({
    assert,
  }) => {
    const map = aggregateBucketLeafRows([
      {
        regulation_id: 1,
        best_coverage_disponible: 'total',
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'total',
      },
      {
        regulation_id: 1,
        best_coverage_disponible: null,
        best_coverage_en_desarrollo: 'parcial',
        best_coverage_planeado: 'total',
      },
      {
        regulation_id: 1,
        best_coverage_disponible: null,
        best_coverage_en_desarrollo: null,
        best_coverage_planeado: null,
      },
    ])

    const percentages = computeCoverageBucketPercentages(map.get(1)!)

    assert.equal(percentages.disponible, 33.3)
    assert.equal(percentages.enDesarrollo, 50)
    assert.equal(percentages.planeado, 66.7)
  })

  test('computeCoverageBucketPercentages retorna null en los tres buckets sin denominador', ({
    assert,
  }) => {
    const percentages = computeCoverageBucketPercentages(emptyBucketCoverageCounts())

    assert.deepEqual(percentages, {
      disponible: null,
      enDesarrollo: null,
      planeado: null,
    })
  })

  test('los buckets acumulativos son monótonos cuando la SQL respeta la jerarquía', ({
    assert,
  }) => {
    const map = aggregateBucketLeafRows([
      {
        regulation_id: 1,
        best_coverage_disponible: null,
        best_coverage_en_desarrollo: 'parcial',
        best_coverage_planeado: 'total',
      },
      {
        regulation_id: 1,
        best_coverage_disponible: 'total',
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'total',
      },
    ])

    const { disponible, enDesarrollo, planeado } = computeCoverageBucketPercentages(map.get(1)!)

    assert.isNotNull(disponible)
    assert.isNotNull(enDesarrollo)
    assert.isNotNull(planeado)
    assert.isTrue(disponible! <= enDesarrollo!)
    assert.isTrue(enDesarrollo! <= planeado!)
  })

  test('aggregateBucketLeafRows agrupa por norma y suma evaluableClauses', ({ assert }) => {
    const map = aggregateBucketLeafRows([
      {
        regulation_id: 1,
        best_coverage_disponible: 'total',
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'total',
      },
      {
        regulation_id: 2,
        best_coverage_disponible: null,
        best_coverage_en_desarrollo: null,
        best_coverage_planeado: null,
      },
    ])

    assert.equal(map.get(1)!.evaluableClauses, 1)
    assert.equal(map.get(2)!.evaluableClauses, 1)
  })

  test('coveredTotal + coveredPartial por bucket no excede evaluableClauses', ({ assert }) => {
    const map = aggregateBucketLeafRows([
      {
        regulation_id: 1,
        best_coverage_disponible: 'total',
        best_coverage_en_desarrollo: 'parcial',
        best_coverage_planeado: null,
      },
      {
        regulation_id: 1,
        best_coverage_disponible: 'parcial',
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'parcial',
      },
    ])

    const counts = map.get(1)!
    for (const bucket of [counts.disponible, counts.enDesarrollo, counts.planeado] as const) {
      assert.isAtMost(
        bucket.coveredTotal + bucket.coveredPartial,
        counts.evaluableClauses,
        'Un numeral no puede ser total y parcial en el mismo bucket'
      )
    }
  })
})

test.group(`${FEATURE} — agregado cross-norma y filas de summary`, () => {
  test('buildSummaryAggregate suma conteos de todas las normas vigentes', ({ assert }) => {
    const regulations = [
      makeRegulation({ regulation_id: 1 }),
      makeRegulation({ regulation_id: 2, regulation_code: 'NOM-037-STPS' }),
    ]

    const countsByRegulation = aggregateBucketLeafRows([
      {
        regulation_id: 1,
        best_coverage_disponible: 'total',
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'total',
      },
      {
        regulation_id: 1,
        best_coverage_disponible: null,
        best_coverage_en_desarrollo: 'parcial',
        best_coverage_planeado: 'total',
      },
      {
        regulation_id: 2,
        best_coverage_disponible: null,
        best_coverage_en_desarrollo: null,
        best_coverage_planeado: null,
      },
    ])

    const aggregate = buildSummaryAggregate(regulations, countsByRegulation)

    assert.equal(aggregate.evaluableClauses, 3)
    assert.equal(aggregate.coveragePercentage.disponible, 33.3)
    assert.equal(aggregate.coveragePercentage.enDesarrollo, 50)
    assert.equal(aggregate.coveragePercentage.planeado, 66.7)
  })

  test('buildSummaryAggregate con base vacía devuelve ceros y porcentajes null', ({ assert }) => {
    const aggregate = buildSummaryAggregate([], new Map())

    assert.equal(aggregate.evaluableClauses, 0)
    assert.deepEqual(aggregate.coveragePercentage, {
      disponible: null,
      enDesarrollo: null,
      planeado: null,
    })
  })

  test('norma vigente sin numerales hoja en summary: evaluableClauses 0 y porcentajes null', ({
    assert,
  }) => {
    const rows = buildRegulationSummaryRows([makeRegulation({ regulation_id: 99 })], new Map())

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].evaluableClauses, 0)
    assert.deepEqual(rows[0].coveragePercentage, {
      disponible: null,
      enDesarrollo: null,
      planeado: null,
    })
  })

  test('buildRegulationSummaryRow expone solo campos del contrato del summary', ({ assert }) => {
    const counts = aggregateBucketLeafRows([
      {
        regulation_id: 1,
        best_coverage_disponible: 'total',
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'parcial',
      },
    ]).get(1)!

    const row = buildRegulationSummaryRow(makeRegulation(), counts)

    assert.equal(row.regulationCode, 'NOM-035-STPS')
    assert.equal(row.regulationVersion, '2018')
    assert.deepEqual(row.authority, { slug: 'stps', shortName: 'STPS' })
    assert.equal(row.evaluableClauses, 1)
    assert.equal(row.coveragePercentage.disponible, 100)
    assert.equal(row.coveragePercentage.enDesarrollo, 100)
    assert.equal(row.coveragePercentage.planeado, 50)
    assert.notProperty(row, 'regulationType')
    assert.notProperty(row, 'coveredTotal')
    assert.notProperty(row, 'regulationInternalNotes')
  })

  test('buildRegulationSummaryRows incluye todas las normas vigentes aunque no tengan hojas', ({
    assert,
  }) => {
    const regulations = [
      makeRegulation({ regulation_id: 1 }),
      makeRegulation({ regulation_id: 2, regulation_code: 'NOM-037-STPS' }),
    ]
    const counts = aggregateBucketLeafRows([
      {
        regulation_id: 1,
        best_coverage_disponible: 'total',
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'total',
      },
    ])

    const rows = buildRegulationSummaryRows(regulations, counts)

    assert.lengthOf(rows, 2)
    assert.equal(rows[0].evaluableClauses, 1)
    assert.equal(rows[1].evaluableClauses, 0)
    assert.isNull(rows[1].coveragePercentage.disponible)
  })
})

test.group(`${FEATURE} — consistencia bucket disponible vs endpoint por-norma`, () => {
  test('porcentaje disponible del summary coincide con cobertura por-norma para la misma norma', ({
    assert,
  }) => {
    const bucketRows: LeafClauseBucketRow[] = [
      {
        regulation_id: 1,
        best_coverage_disponible: 'total',
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'parcial',
      },
      {
        regulation_id: 1,
        best_coverage_disponible: 'parcial',
        best_coverage_en_desarrollo: 'parcial',
        best_coverage_planeado: null,
      },
      {
        regulation_id: 1,
        best_coverage_disponible: null,
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'total',
      },
    ]

    const bucketCounts = aggregateBucketLeafRows(bucketRows).get(1)!
    const legacyCounts = aggregateLeafRows(
      bucketRows.map((row) => ({
        regulation_id: row.regulation_id,
        best_coverage: row.best_coverage_disponible,
      }))
    ).get(1)!

    const summaryDisponible = computeCoverageBucketPercentages(bucketCounts).disponible
    const perNormaPercentage = computeCoveragePercentage(legacyCounts)

    assert.equal(summaryDisponible, perNormaPercentage)
    assert.equal(summaryDisponible, 50)
  })

  test('buildRegulationSummaryRow.disponible coincide con buildRegulationCoverageRow.coveragePercentage', ({
    assert,
  }) => {
    const reg = makeRegulation()
    const bucketRows: LeafClauseBucketRow[] = [
      {
        regulation_id: 1,
        best_coverage_disponible: 'total',
        best_coverage_en_desarrollo: 'total',
        best_coverage_planeado: 'total',
      },
      {
        regulation_id: 1,
        best_coverage_disponible: 'parcial',
        best_coverage_en_desarrollo: 'parcial',
        best_coverage_planeado: 'parcial',
      },
    ]

    const bucketCounts = aggregateBucketLeafRows(bucketRows).get(1)!
    const legacyCounts = aggregateLeafRows(
      bucketRows.map((row) => ({
        regulation_id: row.regulation_id,
        best_coverage: row.best_coverage_disponible,
      }))
    ).get(1)!

    const summaryRow = buildRegulationSummaryRow(reg, bucketCounts)
    const coverageRow = buildRegulationCoverageRow(reg, legacyCounts)

    assert.equal(summaryRow.coveragePercentage.disponible, coverageRow.coveragePercentage)
    assert.equal(summaryRow.evaluableClauses, coverageRow.evaluableClauses)
    assert.equal(summaryRow.coveragePercentage.disponible, 75)
  })
})

test.group(`${FEATURE} — servicio: getSummary y cachés independientes`, () => {
  test('getSummary delega al repositorio y devuelve aggregate + regulations', async ({
    assert,
  }) => {
    const mock = makeFullMockRepo({ summary: sampleSummary })
    const service = new RegulatoryCoverageService(mock.repo)

    const result = await service.getSummary()

    assert.deepEqual(result, sampleSummary)
    assert.equal(mock.summaryCalls, 1)
  })

  test('getSummary reutiliza su propio caché sin volver a consultar el repositorio', async ({
    assert,
  }) => {
    const mock = makeFullMockRepo({ summary: sampleSummary })
    const service = new RegulatoryCoverageService(mock.repo)

    await service.getSummary()
    await service.getSummary()

    assert.equal(mock.summaryCalls, 1)
  })

  test('getCoverage y getSummary mantienen cachés independientes', async ({ assert }) => {
    const mock = makeFullMockRepo({
      coverageRows: [
        {
          regulationId: 1,
          regulationCode: 'NOM-035-STPS',
          regulationTitle: 'T',
          regulationType: 'NOM',
          regulationVersion: '2018',
          regulationStatus: 'vigente',
          authority: { slug: 'stps', shortName: 'STPS' },
          evaluableClauses: 1,
          coveredTotal: 1,
          coveredPartial: 0,
          uncovered: 0,
          coveragePercentage: 100,
        },
      ],
      summary: sampleSummary,
    })
    const service = new RegulatoryCoverageService(mock.repo)

    await service.getCoverage()
    await service.getSummary()
    await service.getCoverage()
    await service.getSummary()

    assert.equal(mock.coverageCalls, 1)
    assert.equal(mock.summaryCalls, 1)
  })

  test('invalidateCache fuerza nueva consulta en getCoverage y getSummary', async ({ assert }) => {
    const mock = makeFullMockRepo({ summary: sampleSummary })
    const service = new RegulatoryCoverageService(mock.repo)

    await service.getSummary()
    service.invalidateCache()
    await service.getSummary()

    assert.equal(mock.summaryCalls, 2)
  })

  test('getSummary con normas vacías devuelve agregado en cero y arreglo vacío', async ({
    assert,
  }) => {
    const mock = makeFullMockRepo()
    const service = new RegulatoryCoverageService(mock.repo)

    const result = await service.getSummary()

    assert.equal(result.aggregate.evaluableClauses, 0)
    assert.deepEqual(result.aggregate.coveragePercentage, {
      disponible: null,
      enDesarrollo: null,
      planeado: null,
    })
    assert.deepEqual(result.regulations, [])
  })
})

test.group(`${FEATURE} — controller: GET /api/v1/regulatory-coverage/summary`, () => {
  test('401 cuando no hay usuario autenticado', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ user: null })

    await runRegulatoryCoverageSummary(ctx)

    assert.equal(captured.status, 401)
    assert.equal(captured.body?.key, 'no-autenticado')
    assert.exists(captured.body?.title)
    assert.exists(captured.body?.detail)
  })

  test('200 devuelve aggregate y regulations con la forma del contrato', async ({ assert }) => {
    const service = new RegulatoryCoverageService(makeFullMockRepo({ summary: sampleSummary }).repo)
    const { ctx, captured } = makeHttpContext({ user: { userId: 1 } })

    await runRegulatoryCoverageSummary(ctx, service)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')

    const data = captured.body?.data as RegulatoryCoverageSummaryResponse
    assert.exists(data.aggregate)
    assert.equal(data.aggregate.evaluableClauses, 80)
    assert.deepEqual(data.aggregate.coveragePercentage, {
      disponible: 43.8,
      enDesarrollo: 61.3,
      planeado: 78.1,
    })
    assert.lengthOf(data.regulations, 1)
    assert.equal(data.regulations[0].regulationCode, 'NOM-035-STPS')
    assert.deepEqual(data.regulations[0].coveragePercentage, {
      disponible: 45.7,
      enDesarrollo: 62.9,
      planeado: 80,
    })
    assert.notProperty(data.regulations[0], 'coveredTotal')
    assert.notProperty(data, 'regulationsOnly')
  })

  test('500 cuando getSummary lanza error usa key error-calculo-cobertura-summary', async ({
    assert,
  }) => {
    const repo: RegulatoryCoverageRepository = {
      async getCoverageByRegulation() {
        return []
      },
      async getCoverageSummary() {
        throw new Error('fallo de base de datos')
      },
      async getRegulationDetail() {
        return null
      },
    }
    const service = new RegulatoryCoverageService(repo)
    const { ctx, captured } = makeHttpContext({ user: { userId: 1 } })

    await runRegulatoryCoverageSummary(ctx, service)

    assert.equal(captured.status, 500)
    assert.equal(captured.body?.key, 'error-calculo-cobertura-summary')
    assert.equal(captured.body?.detail, 'fallo de base de datos')
    assert.exists(captured.body?.title)
  })
})

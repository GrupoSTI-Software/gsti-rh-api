import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import { runRegulatoryCoverageIndex } from '../../../../app/modules/regulatory-coverage/regulatory_coverage.controller.js'
import RegulatoryCoverageService from '../../../../app/modules/regulatory-coverage/regulatory_coverage.service.js'
import type { RegulationCoverageRow } from '../../../../app/modules/regulatory-coverage/dto/regulatory_coverage.dto.js'

const sampleRows: RegulationCoverageRow[] = [
  {
    regulationId: 1,
    regulationCode: 'NOM-035-STPS',
    regulationTitle: 'Factores de Riesgo en el Trabajo',
    regulationType: 'NOM',
    regulationVersion: '2018',
    regulationStatus: 'vigente',
    authority: { slug: 'stps', shortName: 'STPS' },
    evaluableClauses: 35,
    coveredTotal: 12,
    coveredPartial: 8,
    uncovered: 15,
    coveragePercentage: 45.7,
  },
]

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

test.group('RegulatoryCoverageController — endpoint index', () => {
  test('401 cuando no hay usuario autenticado', async ({ assert }) => {
    const { ctx, captured } = makeHttpContext({ user: null })

    await runRegulatoryCoverageIndex(ctx)

    assert.equal(captured.status, 401)
    assert.equal(captured.body?.key, 'no-autenticado')
    assert.exists(captured.body?.title)
    assert.exists(captured.body?.detail)
  })

  test('200 devuelve la forma esperada con datos del servicio', async ({ assert }) => {
    const mockRepo = {
      async getCoverageByRegulation() {
        return sampleRows
      },
      async getCoverageSummary() {
        return {
          aggregate: {
            evaluableClauses: 0,
            coveragePercentage: { disponible: null, enDesarrollo: null, planeado: null },
          },
          regulations: [],
        }
      },
      async getRegulationDetail() {
        return null
      },
    }
    const service = new RegulatoryCoverageService(mockRepo)
    const { ctx, captured } = makeHttpContext({ user: { userId: 1 } })

    await runRegulatoryCoverageIndex(ctx, service)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.isArray((captured.body?.data as { regulations: RegulationCoverageRow[] }).regulations)

    const regulations = (captured.body?.data as { regulations: RegulationCoverageRow[] }).regulations
    assert.lengthOf(regulations, 1)
    assert.equal(regulations[0].regulationCode, 'NOM-035-STPS')
    assert.equal(regulations[0].coveragePercentage, 45.7)
    assert.deepEqual(regulations[0].authority, { slug: 'stps', shortName: 'STPS' })
    assert.notProperty(regulations[0], 'regulationInternalNotes')
  })

  test('500 cuando el servicio lanza un error', async ({ assert }) => {
    const mockRepo = {
      async getCoverageByRegulation() {
        throw new Error('fallo de base de datos')
      },
      async getCoverageSummary() {
        return {
          aggregate: {
            evaluableClauses: 0,
            coveragePercentage: { disponible: null, enDesarrollo: null, planeado: null },
          },
          regulations: [],
        }
      },
      async getRegulationDetail() {
        return null
      },
    }
    const service = new RegulatoryCoverageService(mockRepo)
    const { ctx, captured } = makeHttpContext({ user: { userId: 1 } })

    await runRegulatoryCoverageIndex(ctx, service)

    assert.equal(captured.status, 500)
    assert.equal(captured.body?.key, 'error-calculo-cobertura')
    assert.equal(captured.body?.detail, 'fallo de base de datos')
    assert.exists(captured.body?.title)
  })
})

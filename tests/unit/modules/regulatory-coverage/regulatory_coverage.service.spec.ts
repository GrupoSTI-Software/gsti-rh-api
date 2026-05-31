import { test } from '@japa/runner'
import RegulatoryCoverageService from '../../../../app/modules/regulatory-coverage/regulatory_coverage.service.js'
import type { RegulatoryCoverageRepository } from '../../../../app/modules/regulatory-coverage/regulatory_coverage.repository.js'
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

function makeMockRepo(rows: RegulationCoverageRow[] = sampleRows): {
  repo: RegulatoryCoverageRepository
  calls: number
} {
  let calls = 0
  const repo: RegulatoryCoverageRepository = {
    async getCoverageByRegulation() {
      calls += 1
      return rows
    },
  }
  return { repo, get calls() { return calls } }
}

test.group('RegulatoryCoverageService — orquestación y caché', () => {
  test('getCoverage delega al repositorio y devuelve sus filas', async ({ assert }) => {
    const { repo } = makeMockRepo()
    const service = new RegulatoryCoverageService(repo)

    const result = await service.getCoverage()

    assert.deepEqual(result, sampleRows)
  })

  test('getCoverage reutiliza el caché en llamadas consecutivas sobre la misma instancia', async ({
    assert,
  }) => {
    const mock = makeMockRepo()
    const service = new RegulatoryCoverageService(mock.repo)

    await service.getCoverage()
    await service.getCoverage()

    assert.equal(mock.calls, 1)
  })

  test('invalidateCache fuerza una nueva consulta al repositorio', async ({ assert }) => {
    const mock = makeMockRepo()
    const service = new RegulatoryCoverageService(mock.repo)

    await service.getCoverage()
    service.invalidateCache()
    await service.getCoverage()

    assert.equal(mock.calls, 2)
  })

  test('getCoverage devuelve arreglo vacío cuando no hay normas vigentes', async ({ assert }) => {
    const { repo } = makeMockRepo([])
    const service = new RegulatoryCoverageService(repo)

    const result = await service.getCoverage()

    assert.deepEqual(result, [])
  })
})

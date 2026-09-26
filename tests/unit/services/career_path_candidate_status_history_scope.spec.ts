import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1786648600061 — asignación explícita de businessUnitId en el alta del
 * historial de estatus (E2) y en los dos llamadores casteados (E3, "la
 * trampa del `as`"), más el saneo del 500 en el controller (E4, CA-4).
 */

function sliceBetween(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken)
  if (start < 0) throw new Error(`No se encontró inicio: ${startToken}`)
  const end = source.indexOf(endToken, start + startToken.length)
  if (end < 0) throw new Error(`No se encontró fin: ${endToken}`)
  return source.slice(start, end)
}

const HISTORY_SERVICE = join(
  process.cwd(),
  'app/services/career_path_candidate_status_history_service.ts'
)
const CANDIDATE_SERVICE = join(process.cwd(), 'app/services/career_path_candidate_service.ts')
const CANDIDATE_CONTROLLER = join(
  process.cwd(),
  'app/controllers/career_path_candidate_controller.ts'
)

test.group('Historial de candidatos — asignación explícita (E2, CA-3)', () => {
  test('el servicio de creación asigna businessUnitId antes de save()', ({ assert }) => {
    const content = readFileSync(HISTORY_SERVICE, 'utf-8')
    const body = sliceBetween(content, 'async create', '}\n}')

    assert.include(
      body,
      'newCareerPathCandidateStatusHistory.businessUnitId = careerPathCandidateStatusHistory.businessUnitId'
    )
    const assignIdx = body.indexOf('businessUnitId =')
    const saveIdx = body.indexOf('.save()')
    assert.isTrue(assignIdx >= 0 && saveIdx >= 0 && assignIdx < saveIdx)
  })
})

test.group('Historial de candidatos — la trampa del "as" (E3, CA-3)', () => {
  test('create() incluye businessUnitId en el literal casteado a CareerPathCandidateStatusHistory', ({
    assert,
  }) => {
    const content = readFileSync(CANDIDATE_SERVICE, 'utf-8')
    const body = sliceBetween(content, 'async create(careerPathCandidate', 'async updateStatus(')

    assert.include(body, 'careerPathCandidateStatusHistory = {')
    assert.include(body, 'businessUnitId: newCareerPathCandidate.businessUnitId')
    assert.include(body, '} as CareerPathCandidateStatusHistory')
  })

  test('updateStatus() incluye businessUnitId en su literal casteado', ({ assert }) => {
    const content = readFileSync(CANDIDATE_SERVICE, 'utf-8')
    const body = sliceBetween(content, 'async updateStatus(', 'async delete(')

    assert.include(body, 'careerPathCandidateStatusHistory = {')
    assert.include(body, 'businessUnitId: currentCareerPathCandidate.businessUnitId')
    assert.include(body, '} as CareerPathCandidateStatusHistory')
  })

  test('los dos literales casteados existen exactamente 2 veces en el archivo (no se olvidó ninguno)', ({
    assert,
  }) => {
    const content = readFileSync(CANDIDATE_SERVICE, 'utf-8')
    const matches = content.match(/businessUnitId: (newCareerPathCandidate|currentCareerPathCandidate)\.businessUnitId,\n\s*changedBy:/g) ?? []
    assert.equal(matches.length, 2)
  })
})

test.group('Historial de candidatos — saneo del 500 (E4, CA-4, R-7)', () => {
  test('el controller declara unexpectedErrorResponse con logger.error y sin exponer error.message', ({
    assert,
  }) => {
    const content = readFileSync(CANDIDATE_CONTROLLER, 'utf-8')

    assert.include(content, "import logger from '@adonisjs/core/services/logger'")
    assert.include(content, 'function unexpectedErrorResponse(')
    assert.include(content, "logger.error({ err: error }, 'career_path_candidate: error inesperado')")
  })

  test('store() y updateStatus() delegan el catch a unexpectedErrorResponse', ({ assert }) => {
    const content = readFileSync(CANDIDATE_CONTROLLER, 'utf-8')
    const storeBody = sliceBetween(content, 'async store({ request, response, i18n, auth }', 'async updateStatus(')
    const updateStatusBody = sliceBetween(content, 'async updateStatus(ctx: HttpContext)', 'async delete(')

    for (const [label, body] of [
      ['store', storeBody],
      ['updateStatus', updateStatusBody],
    ] as const) {
      assert.include(body, 'catch (error) {', label)
      assert.include(body, 'return unexpectedErrorResponse(error, response, t)', label)
      assert.notInclude(body, 'error.code === ', label)
      assert.notInclude(body, 'error: messageError', label)
    }
  })

  test('los otros catch del controller (sin @beforeCreate involucrado) no se tocaron (residual §16)', ({
    assert,
  }) => {
    const content = readFileSync(CANDIDATE_CONTROLLER, 'utf-8')
    const occurrences = content.match(/error: error\.message/g) ?? []
    assert.equal(occurrences.length, 4, 'index, delete, show y el otro listado conservan el patrón legacy')
  })
})

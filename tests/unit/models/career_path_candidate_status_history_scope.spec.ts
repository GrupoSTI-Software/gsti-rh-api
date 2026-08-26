import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import CareerPathCandidateStatusHistory from '#models/career_path_candidate_status_history'

/**
 * USRH1786648600061 — marca propia de empresa en el historial de estatus de
 * candidatos de ruta de carrera. Defensa en profundidad: columna + mixin +
 * hook, heredando de la propuesta padre (CA-3, CA-5).
 */

const MODEL_FILE = join(process.cwd(), 'app/models/career_path_candidate_status_history.ts')

test.group('Historial de candidatos — compone withBusinessUnitScope (CA-5)', () => {
  test('importa y compone withBusinessUnitScope() sin includeGlobal', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
    assert.notInclude(content, 'includeGlobal')
    assertModelHasColumns(assert, CareerPathCandidateStatusHistory, ['businessUnitId'])
  })

  test('el modelo compila e importa correctamente en runtime (sin ciclo bloqueante)', ({
    assert,
  }) => {
    assert.isDefined(CareerPathCandidateStatusHistory)
    assert.isDefined(CareerPathCandidateStatusHistory.$getColumn('businessUnitId'))
  })
})

test.group('Historial de candidatos — resuelve la marca desde la propuesta padre (CA-3)', () => {
  test('declara @beforeCreate que usa resolveParentBusinessUnitId contra CareerPathCandidate', ({
    assert,
  }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')

    assert.include(
      content,
      "import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'"
    )
    assert.include(content, "import CareerPathCandidate from './career_path_candidate.js'")
    assert.include(content, '@beforeCreate()')
    assert.include(content, 'if (instance.businessUnitId) return')
    assert.include(content, 'resolveParentBusinessUnitId(')
    assert.include(
      content,
      "CareerPathCandidate.query()\n          .where('careerPathCandidateId', instance.careerPathCandidateId)"
    )
    assert.include(content, "'el candidato'")
  })

  test('no usa this.related(...) para resolver el padre (relación belongsTo no declarada)', ({
    assert,
  }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    assert.notInclude(content, 'this.related(')
  })

  test('el swagger documenta businessUnitId en properties y en example', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    const propertiesBlock = content.slice(
      content.indexOf('properties:'),
      content.indexOf('example:')
    )
    const exampleBlock = content.slice(content.indexOf('example:'))

    assert.include(propertiesBlock, 'businessUnitId:')
    assert.include(exampleBlock, 'businessUnitId: 1')
  })
})

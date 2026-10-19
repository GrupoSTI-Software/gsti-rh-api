import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import Competency from '#models/competency'
import CompetencyDescriptor from '#models/competency_descriptor'
import CompetencyBracket from '#models/competency_bracket'

/**
 * VLRH-H1792026427127 — separar el catálogo de competencias por empresa.
 * Competency es raíz (resuelve desde TenantContext); descriptor y bracket
 * heredan de su padre vía resolveParentBusinessUnitId. Ninguno usa
 * `includeGlobal`: una fila en NULL (plantilla) es invisible para todos.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')

const TARGETS = [
  { fileName: 'competency.ts', Model: Competency },
  { fileName: 'competency_descriptor.ts', Model: CompetencyDescriptor },
  { fileName: 'competency_bracket.ts', Model: CompetencyBracket },
] as const

test.group('Competencias — compone withBusinessUnitScope()', () => {
  for (const { fileName, Model } of TARGETS) {
    test(`${fileName} importa y compone withBusinessUnitScope() sin includeGlobal`, ({
      assert,
    }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')

      assert.include(
        content,
        "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
      )
      assert.include(content, 'withBusinessUnitScope()')
      assert.notInclude(content, 'withBusinessUnitScope(undefined, { includeGlobal')
      assert.notMatch(content, /withBusinessUnitScope\([^)]*includeGlobal/)
      assertModelHasColumns(assert, Model, ['businessUnitId'])
    })
  }

  test('competency.ts resuelve businessUnitId desde TenantContext (raíz)', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'competency.ts'), 'utf-8')
    assert.include(content, "import { TenantContext } from '#utils/tenant_context'")
    assert.include(content, 'TenantContext.getScope()')
  })

  test('competency_descriptor.ts resuelve businessUnitId desde la competencia padre', ({
    assert,
  }) => {
    const content = readFileSync(join(MODELS_DIR, 'competency_descriptor.ts'), 'utf-8')
    assert.include(
      content,
      "import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'"
    )
    assert.include(content, 'resolveParentBusinessUnitId(')
    assert.include(content, "'la competencia'")
  })

  test('competency_bracket.ts resuelve businessUnitId desde el descriptor padre', ({
    assert,
  }) => {
    const content = readFileSync(join(MODELS_DIR, 'competency_bracket.ts'), 'utf-8')
    assert.include(
      content,
      "import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'"
    )
    assert.include(content, 'resolveParentBusinessUnitId(')
    assert.include(content, "'el descriptor de la competencia'")
  })
})

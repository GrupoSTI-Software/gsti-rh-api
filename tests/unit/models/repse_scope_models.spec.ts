import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1783691644909 — modelos REPSE con columna `business_unit_id` directa
 * deben componer `withBusinessUnitScope()`. `RepseSpecializedService` es
 * excepción documentada (relación indirecta vía padre, sin migración).
 *
 * Recreado tras pérdida de archivos untracked — ver commit cbaba6cc.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')

const MODELS_WITH_MIXIN = [
  'empresa_contratante.ts',
  'repse_registration.ts',
  'contrato_servicio_especializado.ts',
  'asignacion_contrato_especializado.ts',
] as const

test.group('REPSE — modelos con withBusinessUnitScope', () => {
  for (const fileName of MODELS_WITH_MIXIN) {
    test(`${fileName} importa y compone withBusinessUnitScope()`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')

      assert.include(
        content,
        "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
      )
      assert.include(content, 'withBusinessUnitScope()')
    })
  }
})

test.group('REPSE — excepción RepseSpecializedService', () => {
  test('no compone el mixin (sin business_unit_id propia)', ({ assert }) => {
    const content = readFileSync(
      join(MODELS_DIR, 'repse_specialized_service.ts'),
      'utf-8'
    )

    assert.notInclude(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.match(
      content,
      /export default class RepseSpecializedService extends compose\(BaseModel, SoftDeletes\)/
    )
    assert.include(content, 'whereHas')
  })
})

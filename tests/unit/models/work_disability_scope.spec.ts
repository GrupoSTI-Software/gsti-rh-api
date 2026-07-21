import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import WorkDisability from '#models/work_disability'

/**
 * USRH1784259058487 — la raíz work_disabilities recibe su propia marca de
 * pertenencia y compone withBusinessUnitScope(), igual que la PII sensible.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

test.group('Incapacidades — modelo compone withBusinessUnitScope', () => {
  test('work_disability.ts importa y compone withBusinessUnitScope()', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'work_disability.ts'), 'utf-8')

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
  })

  test('work_disability.ts declara la columna businessUnitId', ({ assert }) => {
    assertModelHasColumns(assert, WorkDisability, ['businessUnitId'])
  })

  test('resuelve businessUnitId desde el empleado padre (no del cliente)', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'work_disability.ts'), 'utf-8')

    assert.include(
      content,
      "import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'"
    )
    assert.include(content, '@beforeCreate()')
    assert.include(content, 'resolveParentBusinessUnitId(')
  })
})

test.group('Incapacidades — migración de aislamiento', () => {
  test('existe la migración con backfill desde employees', ({ assert }) => {
    const migrationSlug = 'add_business_unit_id_to_work_disabilities'
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
    const match = migrationFiles.find((f) => f.includes(migrationSlug))
    assert.isDefined(match, `debe existir la migración ${migrationSlug}`)

    if (match) {
      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, 'this.defer(')
      assert.include(content, 'INNER JOIN \\`employees\\` e ON e.employee_id = child.employee_id')
      assert.include(content, 'NOT NULL')
      assert.include(content, 'work_disabilities_business_unit_id_index')
      assert.include(content, 'work_disabilities_business_unit_id_foreign')
      assert.notInclude(content, 'deleted_at')
    }
  })
})

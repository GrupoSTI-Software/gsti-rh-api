import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import Shift from '#models/shift'

/**
 * USRH1783821206521 — `Shift` pasa a ser un modelo dueño de primer nivel:
 * compone `withBusinessUnitScope()` sobre una columna `business_unit_id`
 * propia (ya no depende del CSV `shiftBusinessUnits` para el aislamiento).
 */

const MODEL_FILE = join(process.cwd(), 'app/models/shift.ts')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

test.group('Shift — modelo con withBusinessUnitScope', () => {
  test('importa y compone withBusinessUnitScope()', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
  })

  test('retiró el comentario @tenant-scope pendiente', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')

    assert.notInclude(content, '@tenant-scope pendiente')
  })

  test('declara la columna businessUnitId', ({ assert }) => {
    assertModelHasColumns(assert, Shift, ['businessUnitId'])
  })

  test('conserva shiftBusinessUnits (CSV) como espejo denormalizado', ({ assert }) => {
    assertModelHasColumns(assert, Shift, ['shiftBusinessUnits'])
  })
})

test.group('Shift — migración de aislamiento', () => {
  test('existe la migración que agrega business_unit_id con backfill desde el CSV', ({
    assert,
  }) => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
    const match = migrationFiles.find((f) => f.includes('add_business_unit_id_to_shifts'))
    assert.isDefined(match, 'debe existir la migración de aislamiento de shifts')

    if (match) {
      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
      // Regla del proyecto (CLAUDE.md): nunca `await this.schema` dentro de up()/down().
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, 'this.defer(')
      assert.include(content, 'SUBSTRING_INDEX')
      assert.include(content, 'NOT NULL')
      // Guard de huérfanas: debe abortar antes del MODIFY si quedan filas sin resolver.
      assert.include(content, 'orphanCount > 0')
      assert.include(content, 'throw new Error')
    }
  })
})

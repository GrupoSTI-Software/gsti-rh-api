import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import ShiftException from '#models/shift_exception'

/**
 * USRH1784259058577 — excepciones de turno: marca propia + candado automático
 * para cerrar la fuga IDOR (findOrFail por PK sin filtro de pertenencia).
 */

const MODEL_FILE = join(process.cwd(), 'app/models/shift_exception.ts')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')
const ROUTES_FILE = join(process.cwd(), 'start/routes/shift_exceptions_routes.ts')

test.group('ShiftException — modelo con withBusinessUnitScope', () => {
  test('importa y compone withBusinessUnitScope()', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
  })

  test('declara la columna businessUnitId', ({ assert }) => {
    assertModelHasColumns(assert, ShiftException, ['businessUnitId'])
  })

  test('el hook resuelve desde el empleado padre, con guard idempotente', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')

    assert.include(content, '@beforeCreate()')
    assert.match(content, /if \(instance\.businessUnitId\) return/)
    assert.include(content, 'resolveParentBusinessUnitId(')
    assert.match(
      content,
      /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*Employee\.query\(\)\.where\('employeeId', instance\.employeeId\)/
    )
  })
})

test.group('ShiftException — migración de aislamiento con guard de huérfanos', () => {
  test('existe la migración con guard, backfill, NOT NULL, índice y FK', ({ assert }) => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
    const match = migrationFiles.find((f) =>
      f.includes('add_business_unit_id_to_shift_exceptions')
    )
    assert.isDefined(match, 'debe existir la migración de aislamiento de shift_exceptions')

    if (match) {
      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
      // Regla del proyecto (CLAUDE.md): nunca `await this.schema` dentro de up()/down().
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, 'this.defer(')
      assert.include(content, 'employee_id IS NULL')
      assert.include(content, 'throw new Error(')
      assert.include(
        content,
        'INNER JOIN \\`employees\\` e ON e.employee_id = child.employee_id'
      )
      assert.include(content, 'MODIFY COLUMN \\`business_unit_id\\` INT UNSIGNED NOT NULL')
      assert.notMatch(content, /WHERE\s+child\.\w*deleted_at/i)
    }
  })
})

test.group('ShiftException — rutas ya montan businessScope (sin cambio)', () => {
  test('el grupo conserva auth() + businessScope()', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })
})

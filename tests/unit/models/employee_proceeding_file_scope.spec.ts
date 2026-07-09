import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'

/**
 * USRH1783372659486 — `EmployeeProceedingFile` es el único "punto de entrada
 * directo" al que esta HU le da defensa en profundidad: su propia marca de
 * pertenencia (`business_unit_id`) + `withBusinessUnitScope()`, en vez de
 * depender solo de que el llamador valide primero al empleado padre.
 */

const MODEL_FILE = join(process.cwd(), 'app/models/employee_proceeding_file.ts')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

test.group('EmployeeProceedingFile — defensa en profundidad', () => {
  test('el modelo compone withBusinessUnitScope', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')

    assert.include(content, "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'")
    assert.include(content, 'withBusinessUnitScope()')
  })

  test('el modelo declara la columna businessUnitId', ({ assert }) => {
    assertModelHasColumns(assert, EmployeeProceedingFile, ['businessUnitId'])
  })

  test('existe la migración que agrega business_unit_id con backfill', ({ assert }) => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
    const match = migrationFiles.find((f) =>
      f.includes('add_business_unit_id_to_employee_proceeding_files')
    )
    assert.isDefined(match, 'debe existir la migración de defensa en profundidad')

    if (match) {
      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
      // Regla del proyecto (CLAUDE.md): nunca `await this.schema` dentro de up()/down().
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, "table.integer('business_unit_id')")
      assert.include(content, 'this.defer(')
      assert.include(content, 'NOT NULL')
    }
  })
})

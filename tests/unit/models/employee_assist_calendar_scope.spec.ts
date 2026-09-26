import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import EmployeeAssistCalendar from '#models/employee_assist_calendar'

/**
 * USRH1784259058544 — calendario de asistencia (alto volumen): marca propia
 * + candado, con foco en no degradar el motor de asistencia (sin N+1 en el
 * sync masivo de checadores).
 */

const MODEL_FILE = join(process.cwd(), 'app/models/employee_assist_calendar.ts')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

test.group('EmployeeAssistCalendar — modelo con withBusinessUnitScope', () => {
  test('importa y compone withBusinessUnitScope()', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
  })

  test('declara la columna businessUnitId', ({ assert }) => {
    assertModelHasColumns(assert, EmployeeAssistCalendar, ['businessUnitId'])
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

test.group('EmployeeAssistCalendar — migración de aislamiento', () => {
  test('existe la migración que agrega business_unit_id con backfill desde el empleado', ({
    assert,
  }) => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
    const match = migrationFiles.find((f) =>
      f.includes('add_business_unit_id_to_employee_assist_calendars')
    )
    assert.isDefined(match, 'debe existir la migración de aislamiento del calendario')

    if (match) {
      const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
      // Regla del proyecto (CLAUDE.md): nunca `await this.schema` dentro de up()/down().
      assert.notMatch(content, /await\s+this\.schema/)
      assert.include(content, 'this.defer(')
      assert.include(
        content,
        'INNER JOIN \\`employees\\` e ON e.employee_id = child.employee_id'
      )
      assert.include(content, 'MODIFY COLUMN \\`business_unit_id\\` INT UNSIGNED NOT NULL')
      // Backfill no debe filtrar soft-deleted del hijo: cubre borrados lógicos.
      assert.notMatch(content, /WHERE\s+child\.\w*deleted_at/i)
    }
  })
})

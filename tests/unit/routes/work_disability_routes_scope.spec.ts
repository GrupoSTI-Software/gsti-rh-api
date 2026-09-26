import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058487 — hallazgo crítico: el mixin no filtra si la ruta no pasó
 * por businessScope(). Los cuatro grupos de la familia de incapacidades deben
 * declarar la unidad activa.
 */

const ROUTES_DIR = join(process.cwd(), 'start/routes')

const FAMILY_ROUTE_FILES = [
  'work_disability_routes.ts',
  'work_disability_note_routes.ts',
  'work_disability_period_routes.ts',
  'work_disability_period_expense_routes.ts',
] as const

test.group('Incapacidades — rutas de la familia con businessScope obligatorio', () => {
  for (const fileName of FAMILY_ROUTE_FILES) {
    test(`${fileName} monta auth() y businessScope()`, ({ assert }) => {
      const content = readFileSync(join(ROUTES_DIR, fileName), 'utf-8')

      assert.include(content, 'middleware.auth()')
      assert.include(content, 'middleware.businessScope()')
    })
  }

  test('traumatic_event_report_routes.ts ya declaraba businessScope (sin regresión)', ({
    assert,
  }) => {
    const content = readFileSync(join(ROUTES_DIR, 'traumatic_event_report_routes.ts'), 'utf-8')

    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })
})

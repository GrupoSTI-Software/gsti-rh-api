import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058498 — 404 uniforme en notas/periodos/gastos; rutas ya
 * enganchadas en USRH1784259058487 (no se tocan aquí).
 */

const CONTROLLERS = [
  'work_disability_note_controller.ts',
  'work_disability_period_controller.ts',
  'work_disability_period_expense_controller.ts',
] as const

test.group('Hijos de incapacidades — 404 uniforme y rutas ya enganchadas', () => {
  for (const fileName of CONTROLLERS) {
    test(`${fileName} responde 404 con key recurso-no-encontrado / WD.NF.001`, ({ assert }) => {
      const content = readFileSync(join(process.cwd(), 'app/controllers', fileName), 'utf-8')
      assert.include(content, "key: 'recurso-no-encontrado'")
      assert.include(content, 'WORK_DISABILITY_ERROR_CODES.NOT_FOUND')
    })
  }

  test('los 4 grupos de la familia ya montan businessScope (sin tocar aquí)', ({ assert }) => {
    const routes = [
      'work_disability_routes.ts',
      'work_disability_note_routes.ts',
      'work_disability_period_routes.ts',
      'work_disability_period_expense_routes.ts',
    ]
    for (const fileName of routes) {
      const content = readFileSync(join(process.cwd(), 'start/routes', fileName), 'utf-8')
      assert.include(content, 'middleware.businessScope()')
    }
  })
})

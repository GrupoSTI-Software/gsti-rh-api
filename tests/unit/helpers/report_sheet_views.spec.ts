import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import { frozenHeaderViews } from '#helpers/report_sheet_views'

/** Generadores de Excel que congelan el encabezado con varias vistas o colores fuera de ARGB. */
const REPORT_SOURCES = [
  'app/services/assist_service.ts',
  'app/services/employee_vacation_service.ts',
  'app/services/employee_service.ts',
  'app/services/supplie_service.ts',
  'app/controllers/employee_controller.ts',
]

test.group('Vistas y colores de las hojas de reporte', () => {
  test('una sola vista congelada, con la celda desplazable debajo del encabezado', ({ assert }) => {
    assert.deepEqual(frozenHeaderViews(4), [{ state: 'frozen', ySplit: 4, topLeftCell: 'A5' }])
  })

  test('ningún reporte arma varias vistas congeladas a mano', ({ assert }) => {
    for (const path of REPORT_SOURCES) {
      const source = readFileSync(path, 'utf8')
      assert.notMatch(source, /views = \[\s*\{ state: 'frozen', ySplit: \d+ \},\s*\{/, path)
    }
  })

  test('los colores de celda son ARGB de 8 dígitos', ({ assert }) => {
    for (const path of REPORT_SOURCES) {
      const source = readFileSync(path, 'utf8')
      const shortArgb = source.match(/argb:\s*'[0-9A-Fa-f]{6}'/g) ?? []
      const shortReturns = source.match(/return '[0-9A-Fa-f]{6}'/g) ?? []
      const shortConsts = source.match(/_BG = '[0-9A-Fa-f]{6}'/g) ?? []
      assert.deepEqual([...shortArgb, ...shortReturns, ...shortConsts], [], path)
    }
  })
})

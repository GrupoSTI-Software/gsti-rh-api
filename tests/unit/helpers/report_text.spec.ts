import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import { blankMissingTexts, reportFullName, reportText } from '#helpers/report_text'

test.group('Textos de los reportes', () => {
  test('un dato ausente sale en blanco', ({ assert }) => {
    assert.equal(reportText(null), '')
    assert.equal(reportText(undefined), '')
    assert.equal(reportText('Juan Pérez null'), 'Juan Pérez')
    assert.equal(reportText('undefined  López'), 'López')
    assert.equal(reportText('Nullstein Anulado'), 'Nullstein Anulado')
  })

  test('el nombre completo omite las partes vacías', ({ assert }) => {
    assert.equal(reportFullName('Juan', 'Pérez', null), 'Juan Pérez')
    assert.equal(reportFullName('Ana', undefined, 'Ruiz'), 'Ana Ruiz')
    assert.equal(reportFullName(null, null, null), '')
  })

  test('el libro queda sin null ni undefined en sus textos', ({ assert }) => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Hoja')
    sheet.addRow(['Juan Pérez null', 'undefined', 12, 'Normal'])
    blankMissingTexts(workbook)
    assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), ['Juan Pérez', '', 12, 'Normal'])
  })
})

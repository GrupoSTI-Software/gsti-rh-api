import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import SupplieService from '#services/supplie_service'

/**
 * Reporte de insumos (`GET /api/supplies/excel`). Excel da el libro por dañado
 * cuando la celda superior izquierda del panel congelado cae dentro de las
 * filas fijas; el panel desplazable debe empezar debajo del encabezado.
 */
test.group('Reporte Excel de insumos', () => {
  test('el panel congelado empieza debajo del encabezado', async ({ assert }) => {
    const result = await SupplieService.getExcelReport()
    assert.equal(result.status, 201, result.error)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result.buffer as ArrayBuffer)
    const [view] = workbook.worksheets[0].views as Array<Partial<ExcelJS.WorksheetViewFrozen>>

    assert.equal(view.state, 'frozen')
    assert.equal(view.ySplit, 3)
    assert.equal(view.topLeftCell, 'A4')
  })

  test('el reporte sale en español', async ({ assert }) => {
    const result = await SupplieService.getExcelReport()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result.buffer as ArrayBuffer)
    const sheet = workbook.worksheets[0]
    assert.equal(sheet.name, 'Activos')
    assert.equal(sheet.getCell('A1').value, 'Reporte de activos y resguardos')
    assert.match(String(sheet.getCell('A2').value), /^Generado el \d{1,2} de [a-z]+ de \d{4}$/)
    assert.deepEqual((sheet.getRow(3).values as unknown[]).slice(1, 4), ['Folio', 'Activo', 'Tipo'])
  })

  test('los colores de celda son ARGB de 8 dígitos', async ({ assert }) => {
    const result = await SupplieService.getExcelReport()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result.buffer as ArrayBuffer)
    const colors: string[] = []
    workbook.worksheets[0].eachRow((row) =>
      row.eachCell((cell) => {
        const fill = cell.fill as ExcelJS.FillPattern | undefined
        if (fill?.fgColor?.argb) colors.push(fill.fgColor.argb)
        if (cell.font?.color?.argb) colors.push(cell.font.color.argb)
      })
    )
    assert.isNotEmpty(colors)
    for (const color of colors) assert.match(color, /^[0-9A-F]{8}$/i)
  })
})

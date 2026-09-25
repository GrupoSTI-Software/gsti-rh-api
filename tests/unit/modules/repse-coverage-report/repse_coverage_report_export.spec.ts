import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import {
  buildRepseCoverageWorkbook,
  REPSE_COVERAGE_PERCENT_NUM_FMT,
} from '#modules/repse-coverage-report/repse_coverage_report.workbook'
import { chunkEmployeeIds } from '#modules/repse-coverage-report/repse_coverage_report.service'
import type { RepseCoverageExportRow } from '#modules/repse-coverage-report/dto/repse_coverage_report.dto'

function exportRow(overrides: Partial<RepseCoverageExportRow> = {}): RepseCoverageExportRow {
  return {
    employeeId: 1,
    employeeName: 'Ana López',
    employeeCode: 'E-001',
    companyId: 10,
    companyName: 'Cliente Uno SA de CV',
    diasLaborados: 20,
    diasBase: 15,
    diasPrestados: 2,
    diasServidos: 17,
    porcentajeObservado: 85,
    porcentajeDeclarado: 80,
    diferencia: 5,
    ...overrides,
  }
}

function isBlank(value: ExcelJS.CellValue): boolean {
  return value === null || value === undefined || value === ''
}

async function reload(workbook: ExcelJS.Workbook): Promise<ExcelJS.Worksheet> {
  const buffer = await workbook.xlsx.writeBuffer()
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(buffer as ArrayBuffer)
  return loaded.worksheets[0]
}

test.group('Reporte de cobertura REPSE: Excel', () => {
  test('los porcentajes se escriben como número con dos decimales, no como texto', async ({ assert }) => {
    const sheet = await reload(buildRepseCoverageWorkbook([exportRow({ porcentajeObservado: 87.5 })]))

    assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(8, 11), [
      '% Observado',
      '% Declarado',
      'Diferencia',
    ])
    for (const column of ['H', 'I', 'J']) {
      const cell = sheet.getCell(`${column}2`)
      assert.equal(typeof cell.value, 'number', `columna ${column}`)
      assert.equal(cell.numFmt, REPSE_COVERAGE_PERCENT_NUM_FMT)
    }
    assert.equal(sheet.getCell('H2').value, 87.5)
    assert.equal(sheet.getCell('I2').value, 80)
    assert.equal(sheet.getCell('J2').value, 5)
  })

  test('sin porcentaje declarado ni razón social las celdas quedan en blanco', async ({ assert }) => {
    const sheet = await reload(
      buildRepseCoverageWorkbook([
        exportRow({ companyName: '', employeeCode: null, porcentajeDeclarado: null, diferencia: null }),
      ])
    )

    assert.isTrue(isBlank(sheet.getCell('B2').value))
    assert.isTrue(isBlank(sheet.getCell('C2').value))
    assert.isNull(sheet.getCell('I2').value)
    assert.isNull(sheet.getCell('J2').value)
  })

  test('ninguna celda dice "null", "undefined" ni "Recursos"', async ({ assert }) => {
    const sheet = await reload(
      buildRepseCoverageWorkbook([
        exportRow({ employeeName: 'Ana null López', companyName: 'undefined' }),
      ])
    )
    const texts: string[] = []
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (typeof cell.value === 'string') texts.push(cell.value)
      })
    )
    for (const text of texts) {
      assert.notMatch(text, /\b(null|undefined)\b/i)
      assert.notEqual(text, 'Recursos')
    }
    assert.equal(sheet.getCell('A2').value, 'Ana López')
  })

  test('todas las filas llegan al Excel aunque sean más de 500', async ({ assert }) => {
    const rows = Array.from({ length: 1234 }, (_, index) =>
      exportRow({ employeeId: index + 1, employeeName: `Empleado ${index + 1}` })
    )
    const sheet = await reload(buildRepseCoverageWorkbook(rows))
    assert.equal(sheet.rowCount, rows.length + 1)
  })
})

test.group('Reporte de cobertura REPSE: lotes de empleados', () => {
  test('parte los ids en lotes sin perder ni repetir ninguno', ({ assert }) => {
    const ids = Array.from({ length: 1001 }, (_, index) => index + 1)
    const batches = chunkEmployeeIds(ids, 200)

    assert.lengthOf(batches, 6)
    assert.isTrue(batches.every((batch) => batch.length <= 200))
    assert.deepEqual(batches.flat(), ids)
  })

  test('sin ids no hay lotes y un tamaño inválido no se cuelga', ({ assert }) => {
    assert.deepEqual(chunkEmployeeIds([], 200), [])
    assert.deepEqual(chunkEmployeeIds([1, 2], 0), [[1], [2]])
  })
})

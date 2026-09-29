import { test } from '@japa/runner'
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import i18nManager from '@adonisjs/i18n/services/main'
import AssistsService from '#services/assist_service'
import { reportI18n } from '#helpers/report_locale'

/**
 * Los reportes de asistencia (`/api/v1/assists/get-excel-*`, formato de nómina,
 * permisos por fechas y los jobs `/api/v1/assists/reports`) salen siempre en
 * español, aunque la petición llegue en inglés: el servicio de la descarga se
 * construye con `reportI18n()` y no con el `ctx.i18n` de la petición.
 */

const noProgress = async () => {}
const FILTERS = { filterDate: '2026-08-01', filterDateEnd: '2026-08-15', businessUnitId: 1 }

/** Una sola vista, congelada hasta la fila del encabezado (Excel solo aplica la primera). */
function assertFrozenAtHeader(
  assert: { lengthOf: (value: unknown[], n: number) => void; equal: (a: unknown, b: unknown) => void },
  sheet: ExcelJS.Worksheet,
  headerRow: number
): void {
  const views = sheet.views as Array<Partial<ExcelJS.WorksheetViewFrozen>>
  assert.lengthOf(views, 1)
  assert.equal(views[0].ySplit, headerRow)
  assert.equal(views[0].topLeftCell, `A${headerRow + 1}`)
}

async function loadSheet(buffer: ExcelJS.Buffer | undefined): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)
  return workbook.worksheets[0]
}

function rowTexts(sheet: ExcelJS.Worksheet, rowNumber: number): string[] {
  return (sheet.getRow(rowNumber).values as unknown[]).slice(1).map((value) => String(value ?? ''))
}

/** Cuerpo de un método del controlador, hasta el siguiente método público. */
function methodBody(source: string, method: string): string {
  const start = source.indexOf(`  async ${method}(`)
  const next = source.indexOf('\n  async ', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

test.group('Reportes de asistencia en español', () => {
  test('las rutas de descarga construyen el servicio con el traductor de reportes', ({ assert }) => {
    const root = process.cwd()
    const controller = fs.readFileSync(path.join(root, 'app/controllers/assists_controller.ts'), 'utf8')
    for (const method of [
      'getExcelByEmployee',
      'getExcelByPosition',
      'getExcelByDepartment',
      'getExcelAll',
      'getExcelPermissionsByDates',
    ]) {
      const body = methodBody(controller, method)
      assert.include(body, 'new AssistsService(reportI18n())', method)
      assert.notInclude(body, 'new AssistsService(i18n)', method)
    }

    const jobs = fs.readFileSync(path.join(root, 'app/services/report_job_service.ts'), 'utf8')
    assert.include(jobs, 'new AssistsService(reportI18n())')
  })

  test('el traductor de reportes ignora el idioma de la petición', ({ assert }) => {
    assert.equal(i18nManager.locale('en').t('incident_summary'), 'Incident Summary')
    assert.equal(reportI18n().t('incident_summary'), 'Resumen de incidencias')
  })

  test('permisos por fechas: hoja, título, periodo y encabezados en español', async ({ assert }) => {
    const service = new AssistsService(reportI18n())
    const result = await service.getExcelPermissionsByDates(FILTERS, [], [1])
    assert.equal(result.status, 201, 'error' in result ? String(result.error) : undefined)

    const sheet = await loadSheet(result.buffer)
    assert.equal(sheet.name, 'Permisos por Fechas')
    assert.equal(sheet.getCell('A2').value, 'Reporte de Permisos por Fechas')
    assert.equal(
      sheet.getCell('A3').value,
      'Desde 1 de agosto de 2026 hasta 15 de agosto de 2026'
    )
    assert.deepEqual(rowTexts(sheet, 4).slice(0, 4), [
      'Unidad de negocio de trabajo',
      'Unidad de nómina',
      'ID Empleado',
      'Empleado',
    ])
  })

  test('asistencias de toda la empresa: hoja y encabezados en español', async ({ assert }) => {
    const service = new AssistsService(reportI18n())
    const result = await service.generateAssistanceAllBuffer(FILTERS, [], [1], noProgress)
    assert.equal(result.status, 201)
    assert.isTrue('buffer' in result)

    const sheet = await loadSheet('buffer' in result ? result.buffer : undefined)
    assert.equal(sheet.name, 'Reporte de asistencias')
    assert.equal(sheet.getCell('A2').value, 'Reporte de asistencias')
    assertFrozenAtHeader(assert, sheet, 4)
    const headers = rowTexts(sheet, 4)
    assert.includeMembers(headers, [
      'ID de empleado',
      'Nombre del empleado',
      'Departamento',
      'Fecha',
      'Entrada',
      'Salida',
      'Horas trabajadas',
      'Estatus',
    ])
  })

  test('resumen de incidencias: hoja, título y encabezados en español', async ({ assert }) => {
    const service = new AssistsService(reportI18n())
    const result = await service.generateIncidentSummaryBuffer(FILTERS, [], [1], true, true, noProgress)
    assert.equal(result.status, 201)

    const sheet = await loadSheet('buffer' in result ? result.buffer : undefined)
    assert.equal(sheet.name, 'Resumen de incidencias')
    assert.match(String(sheet.getCell('B1').value), /^Reporte resumido Desde 1 de agosto de 2026 hasta/)
    assertFrozenAtHeader(assert, sheet, 3)
    const headers = rowTexts(sheet, 3)
    assert.includeMembers(headers, ['Unidad de negocio de trabajo', 'Días trabajados', 'A tiempo', 'Pagar', 'Descuentos'])
    for (const header of headers) {
      assert.notMatch(header, /^[a-z]+(_[a-z]+)+$/, `llave i18n cruda en encabezado: ${header}`)
    }
  })

  test('incidencias para nómina: hoja completa (31 caracteres) y encabezados en español', async ({ assert }) => {
    const service = new AssistsService(reportI18n())
    const result = await service.generateIncidentSummaryPayrollBuffer(
      { ...FILTERS, filterDatePay: '2026-08-06' },
      [],
      [1],
      noProgress
    )
    assert.equal(result.status, 201)

    const sheet = await loadSheet('buffer' in result ? result.buffer : undefined)
    assert.equal(sheet.name, 'Resumen incidencias nómina')
    assert.equal(sheet.getCell('A1').value, 'Resumen de incidencias para nómina')
    assert.match(String(sheet.getCell('F2').value), /^Incidencias .+ Desde 1 de agosto de 2026 hasta/)
    assertFrozenAtHeader(assert, sheet, 5)
    assert.includeMembers(rowTexts(sheet, 5), ['Empresa', 'Falta', 'Retardo', 'Otros'])
  })
})

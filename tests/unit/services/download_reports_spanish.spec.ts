import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import i18nManager from '@adonisjs/i18n/services/main'
import CalendarExportService from '#services/calendar_export_service'
import ComplaintService from '#services/complaint_service'
import PositionService from '#services/position_service'
import Holiday from '#models/holiday'
import Employee from '#models/employee'
import Person from '#models/person'
import Position from '#models/position'
import type { ComplaintReportResult } from '../../../app/interfaces/complaint_interface.js'

/**
 * Los archivos descargables salen siempre en español (`report_locale.ts`),
 * aunque la petición llegue en inglés: se comparten con nómina, auditoría y
 * autoridades y no deben cambiar de idioma según quién los descargó.
 */
async function firstSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  return workbook.worksheets[0]
}

function rowValues(sheet: ExcelJS.Worksheet, rowNumber: number): unknown[] {
  return (sheet.getRow(rowNumber).values as unknown[]).slice(1)
}

test.group('Descargables en español', () => {
  test('calendario: festividades en español aunque la petición llegue en inglés', async ({ assert }) => {
    const holiday = new Holiday()
    holiday.holidayName = 'Día de la Independencia'
    holiday.holidayDate = '2026-09-16'
    holiday.holidayIsOfficialRestDay = true

    const buffer = await new CalendarExportService().holidays([holiday], 2026)
    const sheet = await firstSheet(buffer)

    assert.equal(sheet.name, '2026 Festividades')
    assert.deepEqual(rowValues(sheet, 1), ['Fecha', 'Festividad', 'Tipo'])
    assert.deepEqual(rowValues(sheet, 2), ['16/09/2026', 'Día de la Independencia', 'Descanso oficial'])
  })

  test('calendario: cumpleaños en dd/MM/yyyy y en orden cronológico', async ({ assert }) => {
    const build = (name: string, birthday: string) => {
      const person = new Person()
      person.personFirstname = name
      person.personLastname = 'Prueba'
      person.personBirthday = birthday
      const employee = new Employee()
      employee.employeePayrollCode = name
      employee.$setRelated('person', person)
      return employee
    }
    // Orden alfabético del texto dd/MM pondría el 02/12 antes del 15/03.
    const employees = [build('Dic', '1990-12-02'), build('Mar', '1985-03-15')]

    const buffer = await new CalendarExportService().birthdays(employees, 2026)
    const sheet = await firstSheet(buffer)

    assert.equal(sheet.name, '2026 Cumpleaños')
    assert.deepEqual(rowValues(sheet, 1).slice(0, 3), ['Fecha', 'Número de nómina', 'Colaborador'])
    assert.equal(sheet.getCell('A2').value, '15/03/2026')
    assert.equal(sheet.getCell('A3').value, '02/12/2026')
  })

  test('buzón de quejas: Excel y encabezados en español con periodo dd/MM/yyyy', async ({ assert }) => {
    const report: ComplaintReportResult = {
      period: { from: '2026-09-01', to: '2026-09-30' },
      totalVolume: 3,
      byCategory: [
        { category: 'violencia-laboral', count: 2 },
        { category: 'otro', count: 1 },
      ],
      averageResolutionTimeHours: null,
      resolvedCasesCount: 0,
    }

    const buffer = await new ComplaintService().buildReportExcel(report)
    const sheet = await firstSheet(buffer)

    assert.equal(sheet.name, 'Reporte quejas')
    assert.equal(sheet.getCell('A1').value, 'Reporte agregado — Buzón de quejas')
    assert.deepEqual(rowValues(sheet, 2), ['Periodo', '01/09/2026 — 30/09/2026'])
    assert.deepEqual(rowValues(sheet, 4), ['Tiempo promedio de resolución (horas)', 'No aplica'])
    assert.deepEqual(rowValues(sheet, 8), ['Categoría', 'Conteo'])
    assert.deepEqual(rowValues(sheet, 9), ['Violencia laboral', 2])
  })

  test('perfil de puesto: Excel en español aunque la petición llegue en inglés', async ({ assert }) => {
    const position = await Position.query()
      .whereNull('position_deleted_at')
      .whereNotNull('business_unit_id')
      .first()
    if (!position) {
      assert.fail('La base de pruebas no tiene puestos para generar el perfil')
      return
    }

    const buffer = await new PositionService(i18nManager.locale('en')).getExcel(position.positionId, [
      position.businessUnitId,
    ])
    assert.isNotNull(buffer)
    const sheet = await firstSheet(buffer!)

    assert.equal(sheet.name, 'DESCRIPCIÓN Y PERFIL DE PUESTO')
    assert.equal(sheet.getCell('A1').value, 'DESCRIPCIÓN Y PERFIL DE PUESTO')
    assert.match(
      String(sheet.getCell('A2').value),
      /^Fecha de implementación: \d{2} de [a-záéíóúñ]+ de \d{4}$/
    )
    const kpiHeader = sheet
      .getColumn(1)
      .values.findIndex((value) => value === 'Indicador')
    if (kpiHeader > 0) assert.equal(sheet.getCell(`K${kpiHeader}`).value, 'Frecuencia de ejecución')
  })
})

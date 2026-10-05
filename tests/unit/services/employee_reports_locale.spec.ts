import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import { DateTime } from 'luxon'
import i18nManager from '@adonisjs/i18n/services/main'
import EmployeeController from '#controllers/employee_controller'
import EmployeeVacationService from '#services/employee_vacation_service'

/**
 * Descargables de empleados y vacaciones: salen en español aunque la
 * petición llegue en inglés (regla de `#helpers/report_locale`).
 */

/** Filtros que no encuentran empleados: solo importan hoja y encabezados. */
const EMPTY_VACATION_FILTERS = {
  search: '',
  employeeId: 0,
  departmentId: 0,
  positionId: 0,
  businessUnitId: 0,
  filterStartDate: '2026-01-01',
  filterEndDate: '2026-12-31',
  onlyInactive: false,
  onlyOneYear: true,
}

async function loadFirstSheet(buffer: ExcelJS.Buffer | ArrayBuffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)
  return workbook.worksheets[0]
}

function rowTexts(sheet: ExcelJS.Worksheet, rowNumber: number): unknown[] {
  return (sheet.getRow(rowNumber).values as unknown[]).slice(1)
}

test.group('Descargables de empleados en español', () => {
  test('el reporte de empleados escribe encabezados, fecha y modalidad en español', async ({
    assert,
  }) => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Reporte de empleados')
    const controller = new EmployeeController()
    controller.addHeadRow(sheet, [
      {
        employeeCode: 'E-1',
        employeeHireDate: DateTime.fromISO('2020-03-05T00:00:00.000Z', { zone: 'utc' }).setZone(
          'America/Mexico_City'
        ),
        employeeWorkSchedule: 'Remote',
        person: {
          personFirstname: 'Ana',
          personLastname: 'López',
          personSecondLastname: 'Ruiz',
          personGender: 'Mujer',
        },
      },
    ])

    assert.deepEqual(rowTexts(sheet, 1), [
      'Código de empleado',
      'Nombre del empleado',
      'Departamento',
      'Puesto',
      'Fecha de ingreso',
      'Modalidad de trabajo',
      'Teléfono',
      'Género',
      'CURP',
      'RFC',
      'NSS',
    ])
    const data = rowTexts(sheet, 2)
    assert.equal(data[4], '05/03/2020')
    assert.equal(data[5], 'Home office')
  })
})

test.group('Descargables de vacaciones en español', () => {
  test('el resumen de vacaciones ignora el idioma inglés de la petición', async ({ assert }) => {
    const service = new EmployeeVacationService(i18nManager.locale('en'))
    const result = await service.getVacationsSummaryExcel({ ...EMPTY_VACATION_FILTERS })
    assert.equal(result.status, 201, result.error)

    const sheet = await loadFirstSheet(result.buffer!)
    assert.equal(sheet.name, 'Resumen vacaciones')
    assert.match(
      String(sheet.getCell('A1').value),
      /^Resumen de control de vacaciones, 1 de enero de 2026 a 31 de diciembre de 2026$/
    )
    assert.deepEqual(rowTexts(sheet, 4).slice(0, 5), [
      'ID',
      'Empleado',
      'Departamento',
      'Posición',
      'Fecha de ingreso',
    ])
    assert.deepEqual(rowTexts(sheet, 4).slice(6, 11), [
      'Años',
      'Vac.',
      'Usados',
      'Rest.',
      'Acum. disp.',
    ])
  })

  test('las vacaciones usadas nombran la hoja en español', async ({ assert }) => {
    const service = new EmployeeVacationService(i18nManager.locale('en'))
    const result = await service.getVacationUsedExcel({ ...EMPTY_VACATION_FILTERS })
    assert.equal(result.status, 201, result.error)

    const sheet = await loadFirstSheet(result.buffer!)
    assert.equal(sheet.name, '2026 Vacaciones usadas')
    assert.deepEqual(rowTexts(sheet, 1), ['Fecha', 'ID', 'Empleado', 'Departamento', 'Posición'])
  })

  test('las fechas de vacaciones se escriben dd/MM/yyyy sin correrse de día', ({ assert }) => {
    const service = new EmployeeVacationService(i18nManager.locale('en'))
    assert.equal(service.getDateFromHttp('2026-03-01T00:00:00.000Z'), '01/03/2026')
    assert.equal(service.getDate('2020-03-04T18:00:00.000-06:00'), '05/03/2020')
  })
})

import { test } from '@japa/runner'
import ExcelJS from 'exceljs'
import { DateTime } from 'luxon'
import EmployeeController from '#controllers/employee_controller'

/**
 * Reporte de empleados (`GET /employees/excel`): una fila de datos por
 * empleado en una sola pasada, sin filas vacías al final, con el nombre del
 * puesto (no su id) y sin "null" en nombres ni campos ausentes.
 */

const HEADER_ROW = 3

const FIXTURE_EMPLOYEES = [
  {
    employeeCode: 'E-1',
    employeeHireDate: DateTime.fromISO('2020-03-05T00:00:00.000Z', { zone: 'utc' }),
    employeeWorkSchedule: 'Onsite',
    department: { departmentName: 'Operaciones' },
    position: { positionName: 'Supervisor' },
    person: { personFirstname: 'Ana', personLastname: 'López', personSecondLastname: 'Ruiz' },
  },
  {
    employeeCode: 'E-2',
    employeeHireDate: null,
    employeeWorkSchedule: 'Remote',
    department: null,
    position: { positionName: 'Analista' },
    person: { personFirstname: 'Luis', personLastname: 'Pérez', personSecondLastname: null },
  },
  {
    employeeCode: 3,
    employeeHireDate: '2021-01-10',
    employeeWorkSchedule: null,
    department: { departmentName: 'Finanzas' },
    position: null,
    person: { personFirstname: 'Eva', personLastname: undefined, personSecondLastname: 'Soto' },
  },
]

async function roundTrip(workbook: ExcelJS.Workbook): Promise<ExcelJS.Worksheet> {
  const buffer = await workbook.xlsx.writeBuffer()
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(buffer as ArrayBuffer)
  return loaded.worksheets[0]
}

function rowTexts(sheet: ExcelJS.Worksheet, rowNumber: number): unknown[] {
  return (sheet.getRow(rowNumber).values as unknown[]).slice(1)
}

test.group('Reporte de empleados: una fila por empleado', () => {
  test('filas de datos = empleados y ninguna fila vacía', async ({ assert }) => {
    const controller = new EmployeeController()
    const sheet = await roundTrip(controller.buildEmployeesListWorkbook(FIXTURE_EMPLOYEES))

    assert.equal(sheet.getCell(`A${HEADER_ROW}`).value, 'Código de empleado')
    const dataRows = sheet.rowCount - HEADER_ROW
    assert.equal(dataRows, FIXTURE_EMPLOYEES.length)
    for (let rowNumber = HEADER_ROW + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const filled = rowTexts(sheet, rowNumber).filter(
        (value) => value !== null && value !== undefined && value !== ''
      )
      assert.isAbove(filled.length, 0, `la fila ${rowNumber} está vacía`)
    }
  })

  test('puesto por nombre, departamento precargado y sin "null"', async ({ assert }) => {
    const controller = new EmployeeController()
    const sheet = await roundTrip(controller.buildEmployeesListWorkbook(FIXTURE_EMPLOYEES))

    assert.deepEqual(rowTexts(sheet, HEADER_ROW + 1).slice(0, 5), [
      'E-1',
      'Ana López Ruiz',
      'Operaciones',
      'Supervisor',
      '05/03/2020',
    ])
    const second = rowTexts(sheet, HEADER_ROW + 2)
    assert.equal(second[1], 'Luis Pérez')
    assert.equal(second[2], '')
    assert.equal(second[3], 'Analista')
    const third = rowTexts(sheet, HEADER_ROW + 3)
    assert.equal(third[1], 'Eva Soto')
    assert.equal(third[3], '')

    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        assert.notMatch(String(cell.value), /\b(null|undefined)\b/i)
      })
    })
  })
})

test.group('Excepciones de turno: turno vigente del día', () => {
  const at = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' })
  const assignments = [
    { employeShiftsApplySince: '2026-01-01', employeShiftsCreatedAt: at('2026-01-01'), shift: { shiftName: 'Matutino' } },
    { employeShiftsApplySince: '2026-03-01', employeShiftsCreatedAt: at('2026-03-01'), shift: { shiftName: 'Vespertino' } },
    { employeShiftsApplySince: '2026-03-01', employeShiftsCreatedAt: at('2026-03-02'), shift: { shiftName: 'Nocturno' } },
    { employeShiftsApplySince: '2026-06-01', employeShiftsCreatedAt: at('2026-06-01'), shift: { shiftName: 'Mixto' } },
  ]

  test('toma la asignación más reciente anterior o igual al día', ({ assert }) => {
    const controller = new EmployeeController()
    assert.equal(controller.resolveVigentShiftName(assignments, '2026-02-15'), 'Matutino')
    // Misma fecha de aplicación: gana la creada al final
    assert.equal(controller.resolveVigentShiftName(assignments, '2026-03-01'), 'Nocturno')
    assert.equal(
      controller.resolveVigentShiftName(assignments, new Date('2026-06-01T00:00:00.000Z')),
      'Mixto'
    )
  })

  test('sin asignación previa al día no hay turno', ({ assert }) => {
    const controller = new EmployeeController()
    assert.isNull(controller.resolveVigentShiftName(assignments, '2025-12-31'))
  })
})

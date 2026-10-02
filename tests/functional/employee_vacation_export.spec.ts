import { test } from '@japa/runner'
import { ApiRequest } from '@japa/api-client'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import ExcelJS from 'exceljs'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'

/**
 * Exportación de vacaciones desde la ficha del empleado: el resumen de control
 * de vacaciones del calendario acotado a un colaborador. `onlyOneYear` hace
 * que arranque en la fecha pedida y no en la primera vacación de toda la
 * empresa; `periodOnly` deja un solo bloque con el rango completo del período
 * en el título.
 */
const HIRE_DATE = '2020-11-26'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

let actor: TenantActor | null = null
let fixture: EmployeeFixture | null = null

interface SummarySheet {
  title: string
  years: string[]
  rows: number
}

/** Título, años de los bloques (fila 3) y filas de empleados del resumen. */
async function readSummary(body: Buffer): Promise<SummarySheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(body as unknown as ExcelJS.Buffer)
  const sheet = workbook.worksheets[0]
  const years: string[] = []
  sheet.getRow(3).eachCell((cell) => {
    const value = String(cell.value ?? '')
    if (/^\d{4}$/.test(value) && !years.includes(value)) years.push(value)
  })
  return { title: String(sheet.getCell('A1').value ?? ''), years, rows: sheet.rowCount - 4 }
}

test.group('Exportar vacaciones del empleado', (group) => {
  group.setup(async () => {
    // El cliente HTTP no junta binarios por su cuenta: el .xlsx llega como Buffer.
    ApiRequest.addParser(XLSX_TYPE, (response, done) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => done(null, Buffer.concat(chunks)))
    })
    actor = await createBypassActor('owner', 'vacexport')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'vacexport')
    await db
      .from('employees')
      .where('employee_id', fixture.employee.employeeId)
      .update({ employee_hire_date: HIRE_DATE })

    return async () => {
      ApiRequest.removeParser(XLSX_TYPE)
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
    }
  })

  const download = (client: ApiClient, qs: object) =>
    client
      .get('/api/employees-vacations/get-vacations-summary-excel')
      .qs({ employeeId: fixture!.employee.employeeId, onlyOneYear: true, ...qs })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

  test('el período elegido sale en un bloque con su rango en el título', async ({
    client,
    assert,
  }) => {
    const response = await download(client, {
      startDate: '2025-11-26',
      endDate: '2026-11-25',
      periodOnly: true,
    })
    response.assertStatus(201)
    const summary = await readSummary(response.body() as Buffer)
    assert.deepEqual(summary.years, ['2025'])
    assert.include(summary.title, '2025')
    assert.include(summary.title, '2026')
    assert.equal(summary.rows, 1)
  })

  test('el historial va del ingreso a hoy, un bloque por período', async ({ client, assert }) => {
    const response = await download(client, { startDate: HIRE_DATE, endDate: '2026-10-01' })
    response.assertStatus(201)
    const summary = await readSummary(response.body() as Buffer)
    assert.deepEqual(summary.years, ['2020', '2021', '2022', '2023', '2024', '2025', '2026'])
  })
})

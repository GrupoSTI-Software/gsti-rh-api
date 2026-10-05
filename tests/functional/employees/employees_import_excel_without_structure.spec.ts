import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import ExcelJS from 'exceljs'
import db from '@adonisjs/lucid/services/db'
import Department from '#models/department'
import Position from '#models/position'
import Person from '#models/person'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  setModuleEnforcement,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
  createPositionFixture,
} from '#tests/helpers/org_chart_fixtures'

/**
 * USRH1789328927648 — el importador de Excel ya no manda a nadie al relleno:
 * una fila nueva con departamento o puesto vacío o sin coincidencia crea al
 * empleado sin asignar, y una fila de actualización en ese caso conserva lo
 * que el empleado tenía. Punta a punta por HTTP, molde
 * `employees_sensitive_import_excel_http.spec.ts`.
 *
 * El archivo se arma en el propio caso, con la plantilla completa de
 * cabeceras (el importador exige todas las esperadas; las de datos sensibles
 * piden sus concesiones de escritura, que el actor tiene). La suite no aísla
 * entre specs: cada empleado se busca por su identificador de nómina único de
 * corrida.
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Cabeceras que exige el importador, más la columna oculta `ID Empleado` (actualizar). */
const IMPORT_HEADERS = [
  'ID Empleado',
  'Identificador de nómina',
  'Unidad de negocio de trabajo',
  'Unidad de negocio de nómina',
  'Nombre del empleado',
  'Apellido paterno del empleado',
  'Apellido materno del empleado',
  'Fecha de contratación (yyyy/mm/dd)',
  'Departamento',
  'Posición',
  'Salario diario',
  'Fecha de nacimiento (dd/mm/yyyy)',
  'CURP',
  'RFC',
  'NSS',
  'Correo empresa',
  'Correo personal',
  'Teléfono Empresa',
  'Teléfono Personal',
  'Modalidad de trabajo',
  '% Teletrabajo',
  'Nombre contacto emergencia',
  'Apellido paterno contacto emergencia',
  'Apellido materno contacto emergencia',
  'Parentesco contacto emergencia',
  'Teléfono contacto emergencia',
] as const

type ImportHeader = (typeof IMPORT_HEADERS)[number]
type ImportRow = Partial<Record<ImportHeader, string | number>>

/** Excel con una sola fila de datos; toda celda no dada queda vacía. */
async function buildImportExcel(row: ImportRow): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Empleados')
  sheet.addRow([...IMPORT_HEADERS])
  sheet.addRow(IMPORT_HEADERS.map((header) => row[header] ?? null))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test.group('Importación Excel sin estructura ni relleno — USRH1789328927648', (group) => {
  let actor: TenantActor
  let previousEnforcement = false
  let da1: Department
  let da2: Department
  let pa1: Position
  let sinDepartamento: Department
  const payrollCodes: string[] = []
  const seededEmployees: Array<{ employeeId: number; personId: number }> = []

  group.setup(async () => {
    previousEnforcement = await setModuleEnforcement('employees', true)
    actor = await createTenantActor('import-sin-estructura')
    await grantModulePermissions(actor, 'employees', [
      'import-employees',
      'sensitive-identificacion-write',
      'sensitive-contacto-write',
      'sensitive-financiero-write',
    ])

    const unitA = actor.businessUnit.businessUnitId
    da1 = await createDepartmentFixture(unitA, 'DA1')
    da2 = await createDepartmentFixture(unitA, 'DA2')
    pa1 = await createPositionFixture(unitA, 'PA1')
    // Departamento REAL con el nombre del relleno de antes: ya no debe atraer a nadie.
    sinDepartamento = await createDepartmentFixture(unitA, 'Sin departamento')
    sinDepartamento.departmentName = 'Sin departamento'
    await sinDepartamento.save()
  })

  group.teardown(async () => {
    try {
      const created = await db
        .from('employees')
        .where('business_unit_id', actor.businessUnit.businessUnitId)
        .whereIn('employee_payroll_code', payrollCodes)
        .select('employee_id', 'person_id')
      const employeeIds = [
        ...created.map((row) => Number(row.employee_id)),
        ...seededEmployees.map((employee) => employee.employeeId),
      ]
      const personIds = [
        ...created.map((row) => Number(row.person_id)),
        ...seededEmployees.map((employee) => employee.personId),
      ]
      if (employeeIds.length > 0) {
        await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
        await db.from('employees').whereIn('employee_id', employeeIds).delete()
        await Person.query().whereIn('person_id', personIds).delete()
      }
      if (actor) await cleanupOrgChartFixtures(actor.businessUnit.businessUnitId)
      await cleanupTenantActor(actor ?? null)
    } finally {
      await setModuleEnforcement('employees', previousEnforcement)
    }
  })

  function payrollCode(label: string): string {
    const code = `QA-IMP-${STAMP}-${label}`
    payrollCodes.push(code)
    return code
  }

  function importFile(client: ApiClient, buffer: Buffer) {
    return client
      .post('/api/employees/import-excel')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .file('file', buffer, { filename: 'import.xlsx', contentType: XLSX_CONTENT_TYPE })
  }

  async function employeeByPayroll(code: string) {
    return db
      .from('employees')
      .where('business_unit_id', actor.businessUnit.businessUnitId)
      .where('employee_payroll_code', code)
      .first()
  }

  test('CA8: fila nueva con departamento vacío crea al empleado sin asignar, aunque exista un departamento real "Sin departamento"', async ({
    client,
    assert,
  }) => {
    const code = payrollCode('ca8')
    const buffer = await buildImportExcel({
      'Identificador de nómina': code,
      'Unidad de negocio de trabajo': actor.businessUnit.businessUnitName,
      'Unidad de negocio de nómina': actor.businessUnit.businessUnitName,
      'Nombre del empleado': 'Importado',
      'Apellido paterno del empleado': 'SinDepartamento',
    })

    const response = await importFile(client, buffer)

    response.assertStatus(200)
    assert.equal(response.body().data.summary.created, 1)
    assert.equal(response.body().data.summary.updated, 0)
    assert.deepEqual(response.body().data.rowErrors, [])

    const row = await employeeByPayroll(code)
    assert.isNotNull(row)
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)
    assert.notEqual(row.department_id, sinDepartamento.departmentId)
  })

  test('CA9: fila nueva cuyo departamento coincide exactamente con DA2 deja al empleado en DA2', async ({
    client,
    assert,
  }) => {
    const code = payrollCode('ca9')
    const buffer = await buildImportExcel({
      'Identificador de nómina': code,
      'Unidad de negocio de trabajo': actor.businessUnit.businessUnitName,
      'Unidad de negocio de nómina': actor.businessUnit.businessUnitName,
      'Nombre del empleado': 'Importado',
      'Apellido paterno del empleado': 'ConDepartamento',
      Departamento: da2.departmentName,
    })

    const response = await importFile(client, buffer)

    response.assertStatus(200)
    assert.equal(response.body().data.summary.created, 1)
    assert.deepEqual(response.body().data.rowErrors, [])

    const row = await employeeByPayroll(code)
    assert.isNotNull(row)
    assert.equal(row.department_id, da2.departmentId)
    assert.isNull(row.position_id)
  })

  test('CA10: reimportar a un empleado existente con departamento y puesto vacíos conserva DA1/PA1', async ({
    client,
    assert,
  }) => {
    const code = payrollCode('ca10')
    const unitA = actor.businessUnit.businessUnitId
    const person = await Person.create({
      personFirstname: 'Existente',
      personLastname: 'ReimportadoSinEstructura',
      personSecondLastname: 'QA',
      personEmail: `import-sin-estructura-${STAMP}@gsti-tests.local`,
      businessUnitId: unitA,
    })
    const [employeeId] = await db.table('employees').insert({
      employee_slug: opaqueEmployeeSlug(),
      employee_sync_id: `EMP-IMP-${STAMP}`.slice(0, 40),
      employee_code: `EMP-IMP-${STAMP}`.slice(0, 40),
      employee_payroll_code: code,
      employee_first_name: 'Existente',
      employee_last_name: 'ReimportadoSinEstructura',
      employee_second_last_name: 'QA',
      company_id: unitA,
      business_unit_id: unitA,
      payroll_business_unit_id: unitA,
      department_id: da1.departmentId,
      position_id: pa1.positionId,
      person_id: person.personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: `import-sin-estructura-work-${STAMP}@gsti-tests.local`,
      employee_created_at: new Date(),
    })
    seededEmployees.push({ employeeId: Number(employeeId), personId: person.personId })

    const buffer = await buildImportExcel({
      'ID Empleado': Number(employeeId),
      'Identificador de nómina': code,
      'Unidad de negocio de trabajo': actor.businessUnit.businessUnitName,
      'Unidad de negocio de nómina': actor.businessUnit.businessUnitName,
      'Nombre del empleado': 'Existente',
      'Apellido paterno del empleado': 'ReimportadoSinEstructura',
    })

    const response = await importFile(client, buffer)

    response.assertStatus(200)
    assert.equal(response.body().data.summary.created, 0)
    assert.equal(response.body().data.summary.updated, 1)
    assert.deepEqual(response.body().data.rowErrors, [])

    const row = await db.from('employees').where('employee_id', Number(employeeId)).first()
    assert.equal(row.department_id, da1.departmentId)
    assert.equal(row.position_id, pa1.positionId)
  })
})

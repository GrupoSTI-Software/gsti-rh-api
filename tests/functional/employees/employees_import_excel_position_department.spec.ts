import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import ExcelJS from 'exceljs'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import Person from '#models/person'
import Position from '#models/position'
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
  linkDepartmentPositionFixture,
} from '#tests/helpers/org_chart_fixtures'

/**
 * VLRH-H1792361821461 — la importación rechaza la fila cuyo puesto no es del
 * departamento, sin escribir nada de ella, y solo en la empresa destino.
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

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

async function buildImportExcel(rows: ImportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Empleados')
  sheet.addRow([...IMPORT_HEADERS])
  for (const row of rows) {
    sheet.addRow(IMPORT_HEADERS.map((header) => row[header] ?? null))
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test.group('Importación Excel — coherencia puesto y departamento (VLRH-H1792361821461)', (group) => {
  let actor: TenantActor
  let foreignUnit: BusinessUnit
  let previousEnforcement = false
  let produccion: Department
  let ventas: Department
  let supervisor: Position
  let ejecutivo: Position
  let auxiliar: Position
  let ventasE2: Department
  let ejecutivoE2: Position
  let exclusivoE2: Department
  const payrollCodes: string[] = []
  const seededEmployees: Array<{ employeeId: number; personId: number }> = []

  group.setup(async () => {
    previousEnforcement = await setModuleEnforcement('employees', true)
    actor = await createTenantActor('import-puesto-depto')
    await grantModulePermissions(actor, 'employees', [
      'import-employees',
      'sensitive-identificacion-write',
      'sensitive-contacto-write',
      'sensitive-financiero-write',
    ])

    const unit = actor.businessUnit.businessUnitId
    produccion = await createDepartmentFixture(unit, 'Producción')
    ventas = await createDepartmentFixture(unit, 'Ventas')
    supervisor = await createPositionFixture(unit, 'Supervisor de línea')
    ejecutivo = await createPositionFixture(unit, 'Ejecutivo')
    auxiliar = await createPositionFixture(unit, 'Auxiliar')
    await linkDepartmentPositionFixture(produccion.departmentId, supervisor.positionId, unit)
    await linkDepartmentPositionFixture(ventas.departmentId, ejecutivo.positionId, unit)

    const foreignStamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    foreignUnit = await BusinessUnit.create({
      businessUnitName: `Import ajena ${foreignStamp}`,
      businessUnitSlug: `import-ajena-${foreignStamp}`,
      businessUnitLegalName: `Import ajena legal ${foreignStamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    ventasE2 = await createDepartmentFixture(foreignUnit.businessUnitId, 'Ventas')
    ejecutivoE2 = await createPositionFixture(foreignUnit.businessUnitId, 'Ejecutivo')
    exclusivoE2 = await createDepartmentFixture(foreignUnit.businessUnitId, 'Exclusivo E2')
    await linkDepartmentPositionFixture(
      ventasE2.departmentId,
      ejecutivoE2.positionId,
      foreignUnit.businessUnitId
    )
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
        await db.from('employee_branch_offices').whereIn('employee_id', employeeIds).delete()
        await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
        await db.from('employees').whereIn('employee_id', employeeIds).delete()
        await db.from('people').whereIn('person_id', personIds).delete()
      }
      if (actor) await cleanupOrgChartFixtures(actor.businessUnit.businessUnitId)
      if (foreignUnit) {
        await cleanupOrgChartFixtures(foreignUnit.businessUnitId)
        await BusinessUnit.query().where('business_unit_id', foreignUnit.businessUnitId).delete()
      }
      await cleanupTenantActor(actor ?? null)
    } finally {
      await setModuleEnforcement('employees', previousEnforcement)
    }
  })

  function payrollCode(label: string): string {
    const code = `QA-IPD-${STAMP}-${label}`
    payrollCodes.push(code)
    return code
  }

  function baseRow(code: string, extra: ImportRow): ImportRow {
    return {
      'Identificador de nómina': code,
      'Unidad de negocio de trabajo': actor.businessUnit.businessUnitName,
      'Unidad de negocio de nómina': actor.businessUnit.businessUnitName,
      'Nombre del empleado': 'Importado',
      ...extra,
    }
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

  async function seedEmployee(
    label: string,
    structure: { departmentId: number; positionId: number },
    phone: string
  ): Promise<{ employeeId: number; code: string }> {
    const unit = actor.businessUnit.businessUnitId
    const code = payrollCode(label)
    const person = await Person.create({
      personFirstname: 'Sembrado',
      personLastname: label,
      personSecondLastname: 'QA',
      personEmail: `import-puesto-depto-${label}-${STAMP}@gsti-tests.local`,
      businessUnitId: unit,
    })
    const employeeCode = `EMP-IPD-${STAMP}-${label}`.slice(0, 40)
    const [employeeId] = await db.table('employees').insert({
      employee_slug: opaqueEmployeeSlug(),
      employee_sync_id: employeeCode,
      employee_code: employeeCode,
      employee_payroll_code: code,
      employee_first_name: 'Sembrado',
      employee_last_name: label,
      employee_second_last_name: 'QA',
      company_id: unit,
      business_unit_id: unit,
      payroll_business_unit_id: unit,
      department_id: structure.departmentId,
      position_id: structure.positionId,
      person_id: person.personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_phone: phone,
      employee_business_email: `import-puesto-depto-work-${label}-${STAMP}@gsti-tests.local`,
      employee_created_at: new Date(),
    })
    seededEmployees.push({ employeeId: Number(employeeId), personId: person.personId })
    return { employeeId: Number(employeeId), code }
  }

  test('CA-1: una fila de alta descuadrada se reporta y las otras dos se crean', async ({
    client,
    assert,
  }) => {
    const badCode = payrollCode('ca1-mal')
    const goodSales = payrollCode('ca1-ventas')
    const goodLine = payrollCode('ca1-linea')
    const buffer = await buildImportExcel([
      baseRow(badCode, {
        'Apellido paterno del empleado': 'Descuadrado',
        Departamento: ventas.departmentName,
        Posición: supervisor.positionName,
      }),
      baseRow(goodSales, {
        'Apellido paterno del empleado': 'VentasBien',
        Departamento: ventas.departmentName,
        Posición: ejecutivo.positionName,
      }),
      baseRow(goodLine, {
        'Apellido paterno del empleado': 'LineaBien',
        Departamento: produccion.departmentName,
        Posición: supervisor.positionName,
      }),
    ])

    const response = await importFile(client, buffer)

    response.assertStatus(200)
    assert.equal(response.body().type, 'warning')
    assert.equal(response.body().data.summary.created, 2)
    assert.equal(response.body().data.summary.failed, 1)
    assert.lengthOf(response.body().data.rowErrors, 1)
    assert.equal(response.body().data.rowErrors[0].row, 2)
    assert.equal(response.body().data.rowErrors[0].field, 'Puesto')
    const message = String(response.body().data.rowErrors[0].message)
    assert.include(message, supervisor.positionName)
    assert.include(message, produccion.departmentName)
    assert.include(message, ventas.departmentName)

    assert.isNull(await employeeByPayroll(badCode))
    assert.isNull(
      await db
        .from('people')
        .where('business_unit_id', actor.businessUnit.businessUnitId)
        .where('person_lastname', 'Descuadrado')
        .first()
    )
    const sales = await employeeByPayroll(goodSales)
    const line = await employeeByPayroll(goodLine)
    assert.equal(sales.department_id, ventas.departmentId)
    assert.equal(sales.position_id, ejecutivo.positionId)
    assert.equal(line.department_id, produccion.departmentId)
    assert.equal(line.position_id, supervisor.positionId)
  })

  test('CA-2: puesto sin vínculo y puesto sin departamento se reportan; sin puesto se crea', async ({
    client,
    assert,
  }) => {
    const unlinkedCode = payrollCode('ca2-sin-vinculo')
    const missingDepartmentCode = payrollCode('ca2-sin-depto')
    const noPositionCode = payrollCode('ca2-sin-puesto')
    const buffer = await buildImportExcel([
      baseRow(unlinkedCode, {
        'Apellido paterno del empleado': 'SinVinculo',
        Departamento: ventas.departmentName,
        Posición: auxiliar.positionName,
      }),
      baseRow(missingDepartmentCode, {
        'Apellido paterno del empleado': 'SinDepartamento',
        Posición: ejecutivo.positionName,
      }),
      baseRow(noPositionCode, {
        'Apellido paterno del empleado': 'SinPuesto',
        Departamento: ventas.departmentName,
      }),
    ])

    const response = await importFile(client, buffer)

    response.assertStatus(200)
    assert.equal(response.body().type, 'warning')
    assert.equal(response.body().data.summary.created, 1)
    assert.equal(response.body().data.summary.failed, 2)
    const errors = response.body().data.rowErrors as Array<{ row: number; field: string; message: string }>
    const unlinked = errors.find((item) => item.row === 2)
    const missing = errors.find((item) => item.row === 3)
    assert.equal(unlinked?.field, 'Puesto')
    assert.equal(
      unlinked?.message,
      `Puesto sin departamento ligado: el puesto "${auxiliar.positionName}" no pertenece a ningún departamento de la empresa`
    )
    assert.equal(missing?.field, 'Puesto')
    assert.equal(
      missing?.message,
      `Puesto sin departamento: el puesto "${ejecutivo.positionName}" requiere el departamento al que pertenece`
    )

    assert.isNull(await employeeByPayroll(unlinkedCode))
    assert.isNull(await employeeByPayroll(missingDepartmentCode))
    const created = await employeeByPayroll(noPositionCode)
    assert.equal(created.department_id, ventas.departmentId)
    assert.isNull(created.position_id)
  })

  test('CA-3: actualizar a un par incoherente no escribe la fila; el descuadrado que no cambia de par sí', async ({
    client,
    assert,
  }) => {
    const coherentEmployee = await seedEmployee(
      'ca3-x',
      { departmentId: ventas.departmentId, positionId: ejecutivo.positionId },
      '5511111111'
    )
    const mismatchedEmployee = await seedEmployee(
      'ca3-y',
      { departmentId: ventas.departmentId, positionId: supervisor.positionId },
      '5522222222'
    )
    const coherentId = coherentEmployee.employeeId
    const mismatchedId = mismatchedEmployee.employeeId
    const coherentCode = coherentEmployee.code
    const mismatchedCode = mismatchedEmployee.code
    const buffer = await buildImportExcel([
      baseRow(coherentCode, {
        'ID Empleado': coherentId,
        'Apellido paterno del empleado': 'Cambiado',
        'Teléfono Empresa': '5599999999',
        Departamento: ventas.departmentName,
        Posición: supervisor.positionName,
      }),
      baseRow(mismatchedCode, {
        'ID Empleado': mismatchedId,
        'Apellido paterno del empleado': 'ca3-y',
        'Teléfono Empresa': '5533333333',
        Departamento: ventas.departmentName,
        Posición: supervisor.positionName,
      }),
    ])

    const response = await importFile(client, buffer)

    response.assertStatus(200)
    assert.equal(response.body().type, 'warning')
    assert.equal(response.body().data.summary.updated, 1)
    assert.equal(response.body().data.summary.failed, 1)
    assert.equal(response.body().data.rowErrors[0].row, 2)
    assert.equal(response.body().data.rowErrors[0].field, 'Puesto')

    const coherent = await db.from('employees').where('employee_id', coherentId).first()
    assert.equal(coherent.employee_last_name, 'ca3-x')
    assert.equal(coherent.employee_business_phone, '5511111111')
    assert.equal(coherent.department_id, ventas.departmentId)
    assert.equal(coherent.position_id, ejecutivo.positionId)

    const mismatched = await db.from('employees').where('employee_id', mismatchedId).first()
    assert.equal(mismatched.employee_business_phone, '5533333333')
    assert.equal(mismatched.department_id, ventas.departmentId)
    assert.equal(mismatched.position_id, supervisor.positionId)
  })

  test('CA-4: el homónimo de otra empresa no se asigna ni aparece en el reporte', async ({
    client,
    assert,
  }) => {
    const code = payrollCode('ca4')
    const buffer = await buildImportExcel([
      baseRow(code, {
        'Apellido paterno del empleado': 'EmpresaDestino',
        Departamento: ventas.departmentName,
        Posición: ejecutivo.positionName,
      }),
    ])

    const response = await importFile(client, buffer)

    response.assertStatus(200)
    assert.equal(response.body().data.summary.created, 1)
    assert.deepEqual(response.body().data.rowErrors, [])
    const row = await employeeByPayroll(code)
    assert.equal(row.department_id, ventas.departmentId)
    assert.equal(row.position_id, ejecutivo.positionId)
    assert.notEqual(row.department_id, ventasE2.departmentId)
    assert.notEqual(row.position_id, ejecutivoE2.positionId)
    assert.notInclude(JSON.stringify(response.body()), exclusivoE2.departmentName)
  })
})

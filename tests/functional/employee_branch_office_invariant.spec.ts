import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import BranchOffice from '#models/branch_office'
import EmployeeBranchOffice from '#models/employee_branch_office'
import EmployeeBranchOfficeService from '#services/employee_branch_office_service'
import BranchOfficeProvisioningService from '#services/branch_office_provisioning_service'
import { DEFAULT_BRANCH_OFFICE_NAME } from '#constants/branch_office'

/**
 * La invariante: todo empleado tiene sucursal activa, siempre.
 *
 * El candado no vive en un validator sino en el modelo: un empleado que nace
 * sin asignación queda pegado a la sucursal default de su empresa. Eso cubre
 * los seis caminos de alta (backoffice, biométricos, importadores,
 * user_service y demo seed) sin tocar ninguno.
 *
 * Los empleados de estos tests se crean con el MODELO, no con insert crudo:
 * un `db.table('employees').insert()` no dispara hooks de Lucid y no probaría
 * nada de lo que aquí importa.
 */

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Invariante ${label} ${s}`,
    businessUnitSlug: `invariante-${label}-${s}`,
    businessUnitLegalName: `Invariante ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createEmployee(unit: BusinessUnit, label: string): Promise<Employee> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Invariante',
    personLastname: label,
    personSecondLastname: s.slice(0, 25),
    personEmail: `invariante-${label}-${s}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `INV-${s}`
  employee.employeeFirstName = 'Invariante'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s.slice(0, 25)
  employee.employeePayrollNum = `INV-${s}`
  employee.employeeBusinessEmail = person.personEmail!
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.departmentId = null
  employee.employeeTerminatedDate = null
  await employee.save()
  return employee
}

async function createBranch(unit: BusinessUnit, name: string): Promise<BranchOffice> {
  const s = stamp()
  return BranchOffice.create({
    businessUnitId: unit.businessUnitId,
    branchOfficeName: name,
    branchOfficeSlug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${s}`,
    branchOfficeLocationAddress: null,
    branchOfficeIdealTemplateCount: null,
    branchOfficeMinActiveEmployeesPerShift: null,
    empresaContratanteId: null,
  })
}

async function cleanupUnit(unit: BusinessUnit | null) {
  if (!unit) return
  const employees = await Employee.query()
    .withTrashed()
    .where('business_unit_id', unit.businessUnitId)
  const employeeIds = employees.map((e) => e.employeeId)
  if (employeeIds.length > 0) {
    await db.from('employee_branch_offices').whereIn('employee_id', employeeIds).delete()
    await db.from('employees').whereIn('employee_id', employeeIds).delete()
    const personIds = employees.map((e) => e.personId).filter((id): id is number => id !== null)
    if (personIds.length > 0) {
      await Person.query().whereIn('person_id', personIds).delete()
    }
  }
  await db.from('branch_offices').where('business_unit_id', unit.businessUnitId).delete()
  await db.from('business_units').where('business_unit_id', unit.businessUnitId).delete()
}

test.group('Invariante empleado-sucursal — alta', (group) => {
  let unit: BusinessUnit | null = null

  group.each.teardown(async () => {
    await cleanupUnit(unit)
    unit = null
  })

  test('un empleado que nace sin sucursal queda asignado a la default de su empresa', async ({
    assert,
  }) => {
    unit = await createUnit('alta')
    const defaultBranch = await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)

    const employee = await createEmployee(unit, 'SinSucursal')

    const active = await EmployeeBranchOffice.query()
      .where('employee_id', employee.employeeId)
      .where('employee_branch_office_active', 1)
      .first()

    assert.exists(active, 'ningún empleado puede nacer sin sucursal activa')
    assert.equal(active!.branchOfficeId, defaultBranch.branchOfficeId)
  })

  test('el empleado de una empresa sin default la estrena al nacer', async ({ assert }) => {
    unit = await createUnit('estrena')

    const employee = await createEmployee(unit, 'Estrena')

    const branches = await BranchOffice.query().where('business_unit_id', unit.businessUnitId)
    assert.lengthOf(branches, 1, 'la empresa recibe su default de forma perezosa')
    assert.equal(branches[0].branchOfficeName, DEFAULT_BRANCH_OFFICE_NAME)
    assert.equal(branches[0].branchOfficeIsDefault, 1)

    const active = await EmployeeBranchOffice.query()
      .where('employee_id', employee.employeeId)
      .where('employee_branch_office_active', 1)
      .firstOrFail()
    assert.equal(active.branchOfficeId, branches[0].branchOfficeId)
  })
})

test.group('Invariante empleado-sucursal — historial', (group) => {
  let unit: BusinessUnit | null = null

  group.each.teardown(async () => {
    await cleanupUnit(unit)
    unit = null
  })

  test('elegir sucursal justo después del alta no deja rastro de la default en el historial', async ({
    assert,
  }) => {
    unit = await createUnit('colapso')
    await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)
    const elegida = await createBranch(unit, 'Sucursal Elegida')

    const employee = await createEmployee(unit, 'Colapso')
    await EmployeeBranchOfficeService.assign(employee.employeeId, elegida.branchOfficeId, [
      unit.businessUnitId,
    ])

    const rows = await EmployeeBranchOffice.query().where('employee_id', employee.employeeId)

    assert.lengthOf(
      rows,
      1,
      'la fila que el alta dejó en la default se reusa: el empleado nunca estuvo realmente ahí'
    )
    assert.equal(rows[0].branchOfficeId, elegida.branchOfficeId)
    assert.equal(rows[0].employeeBranchOfficeActive, 1)
  })

  test('mover a un empleado que ya vivió un cambio sí abre una fila nueva', async ({ assert }) => {
    unit = await createUnit('historial')
    await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)
    const primera = await createBranch(unit, 'Primera Sede')
    const segunda = await createBranch(unit, 'Segunda Sede')

    const employee = await createEmployee(unit, 'Historial')
    // Primer movimiento: colapsa contra la fila del alta.
    await EmployeeBranchOfficeService.assign(employee.employeeId, primera.branchOfficeId, [
      unit.businessUnitId,
    ])
    // Segundo movimiento: este sí es historia real.
    await EmployeeBranchOfficeService.assign(employee.employeeId, segunda.branchOfficeId, [
      unit.businessUnitId,
    ])

    const rows = await EmployeeBranchOffice.query()
      .where('employee_id', employee.employeeId)
      .orderBy('employee_branch_office_id', 'asc')

    assert.lengthOf(rows, 2, 'un traslado real deja rastro')
    assert.equal(rows[0].branchOfficeId, primera.branchOfficeId)
    assert.equal(rows[0].employeeBranchOfficeActive, 0)
    assert.exists(rows[0].employeeBranchOfficeDeactivatedAt)
    assert.equal(rows[1].branchOfficeId, segunda.branchOfficeId)
    assert.equal(rows[1].employeeBranchOfficeActive, 1)
  })
})

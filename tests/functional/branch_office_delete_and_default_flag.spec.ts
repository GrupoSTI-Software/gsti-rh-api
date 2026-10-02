import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import BranchOffice from '#models/branch_office'
import EmployeeBranchOffice from '#models/employee_branch_office'
import BranchOfficeService from '#services/branch_office_service'
import BranchOfficeProvisioningService from '#services/branch_office_provisioning_service'
import { BRANCH_OFFICE_ERROR_CODES } from '#constants/branch_office_error_codes'
import { BranchOfficeServiceError } from '#exceptions/branch_office_service_error'

/**
 * Borrado de sucursal y transferencia de la marca default.
 *
 * Dos reglas que se sostienen mutuamente: la default no se elimina, y ninguna
 * sucursal con gente se elimina sin decir a dónde va esa gente. Sin la
 * primera, la empresa se queda sin destino; sin la segunda, el borrado produce
 * empleados apuntando a una sucursal muerta — que es lo que hacía antes.
 */

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Borrado ${label} ${s}`,
    businessUnitSlug: `borrado-${label}-${s}`,
    businessUnitLegalName: `Borrado ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
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

async function createEmployeeIn(unit: BusinessUnit, branch: BranchOffice): Promise<Employee> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Borrado',
    personLastname: 'Empleado',
    personSecondLastname: s.slice(0, 25),
    personEmail: `borrado-${s}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `BOR-${s}`
  employee.employeeFirstName = 'Borrado'
  employee.employeeLastName = 'Empleado'
  employee.employeeSecondLastName = s.slice(0, 25)
  employee.employeePayrollNum = `BOR-${s}`
  employee.employeeBusinessEmail = person.personEmail!
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.departmentId = null
  employee.employeeTerminatedDate = null
  await employee.save()

  // El hook lo deja en la default; aquí interesa que viva en `branch`.
  await EmployeeBranchOffice.query()
    .where('employeeId', employee.employeeId)
    .where('employeeBranchOfficeActive', 1)
    .update({ branch_office_id: branch.branchOfficeId })

  return employee
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

test.group('Borrado de sucursal', (group) => {
  let unit: BusinessUnit | null = null

  group.each.teardown(async () => {
    await cleanupUnit(unit)
    unit = null
  })

  test('la sucursal default no se puede eliminar', async ({ assert }) => {
    unit = await createUnit('default')
    const defaultBranch = await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)

    let error: BranchOfficeServiceError | null = null
    try {
      await BranchOfficeService.delete(defaultBranch.branchOfficeId, [unit.businessUnitId])
    } catch (e) {
      error = e as BranchOfficeServiceError
    }

    assert.exists(error, 'eliminar la default debe fallar')
    assert.equal(error?.key, 'sucursal-default-no-eliminable')
    assert.equal(error?.errorCode, BRANCH_OFFICE_ERROR_CODES.DEFAULT_NOT_DELETABLE)
    assert.equal(error?.httpStatus, 409)

    const stillThere = await BranchOffice.find(defaultBranch.branchOfficeId)
    assert.exists(stillThere)
  })

  test('eliminar una sucursal con empleados sin decir destino falla', async ({ assert }) => {
    unit = await createUnit('sin-destino')
    await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)
    const sede = await createBranch(unit, 'Sede Con Gente')
    await createEmployeeIn(unit, sede)

    let error: BranchOfficeServiceError | null = null
    try {
      await BranchOfficeService.delete(sede.branchOfficeId, [unit.businessUnitId])
    } catch (e) {
      error = e as BranchOfficeServiceError
    }

    assert.exists(error)
    assert.equal(error?.key, 'sucursal-requiere-destino')
    assert.equal(error?.errorCode, BRANCH_OFFICE_ERROR_CODES.TARGET_REQUIRED)
    assert.equal(error?.httpStatus, 409)
  })

  test('eliminar con destino mueve a los empleados y deja el traslado en el historial', async ({
    assert,
  }) => {
    unit = await createUnit('con-destino')
    const defaultBranch = await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)
    const sede = await createBranch(unit, 'Sede Que Cierra')
    const employee = await createEmployeeIn(unit, sede)

    await BranchOfficeService.delete(sede.branchOfficeId, [unit.businessUnitId], {
      targetBranchOfficeId: defaultBranch.branchOfficeId,
    })

    const active = await EmployeeBranchOffice.query()
      .where('employeeId', employee.employeeId)
      .where('employeeBranchOfficeActive', 1)
      .firstOrFail()
    assert.equal(active.branchOfficeId, defaultBranch.branchOfficeId)

    const closed = await EmployeeBranchOffice.query()
      .where('employeeId', employee.employeeId)
      .where('employeeBranchOfficeActive', 0)
      .firstOrFail()
    assert.equal(closed.branchOfficeId, sede.branchOfficeId, 'el paso por la sede cerrada se conserva')
    assert.exists(closed.employeeBranchOfficeDeactivatedAt)

    const deleted = await BranchOffice.find(sede.branchOfficeId)
    assert.isNull(deleted, 'la sucursal queda eliminada')
  })

  test('el destino tiene que ser una sucursal viva de la misma empresa', async ({ assert }) => {
    unit = await createUnit('destino-ajeno')
    await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)
    const sede = await createBranch(unit, 'Sede Origen')
    await createEmployeeIn(unit, sede)

    let error: BranchOfficeServiceError | null = null
    try {
      await BranchOfficeService.delete(sede.branchOfficeId, [unit.businessUnitId], {
        targetBranchOfficeId: sede.branchOfficeId,
      })
    } catch (e) {
      error = e as BranchOfficeServiceError
    }

    assert.exists(error, 'no se puede mandar a los empleados a la sucursal que se está borrando')
    assert.equal(error?.key, 'sucursal-destino-invalido')
  })

  test('una sucursal vacía se elimina sin pedir destino', async ({ assert }) => {
    unit = await createUnit('vacia')
    await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)
    const vacia = await createBranch(unit, 'Sede Vacia')

    await BranchOfficeService.delete(vacia.branchOfficeId, [unit.businessUnitId])

    const deleted = await BranchOffice.find(vacia.branchOfficeId)
    assert.isNull(deleted)
  })
})

test.group('Domicilio de la sucursal', (group) => {
  let unit: BusinessUnit | null = null

  group.each.teardown(async () => {
    await cleanupUnit(unit)
    unit = null
  })

  test('el alta guarda el domicilio y el listado lo devuelve', async ({ assert }) => {
    unit = await createUnit('domicilio')

    const creada = (await BranchOfficeService.create(
      {
        businessUnitId: unit.businessUnitId,
        branchOfficeName: 'Planta Norte',
        branchOfficeStreet: 'Av. Industrial 1420',
        branchOfficeSettlement: 'Parque Industrial Toluca 2000',
        branchOfficeZipcode: '50200',
        branchOfficeCity: 'Toluca',
        branchOfficeState: 'Estado de Mexico',
      },
      [unit.businessUnitId]
    )) as { branchOfficeId: number; branchOfficeStreet: string; branchOfficeCity: string }

    assert.equal(creada.branchOfficeStreet, 'Av. Industrial 1420')
    assert.equal(creada.branchOfficeCity, 'Toluca')

    const guardada = await BranchOffice.findOrFail(creada.branchOfficeId)
    assert.equal(guardada.branchOfficeSettlement, 'Parque Industrial Toluca 2000')
    assert.equal(guardada.branchOfficeZipcode, '50200')
    assert.equal(guardada.branchOfficeState, 'Estado de Mexico')
  })

  test('el alta sin businessUnitId usa la empresa activa de la sesion', async ({ assert }) => {
    unit = await createUnit('scope-activo')

    // El backoffice conoce la empresa por su publicId (UUID), no por su id
    // numerico: el alta no puede mandarlo y la resuelve el scope de la sesion.
    const creada = (await BranchOfficeService.create(
      { branchOfficeName: 'Sucursal Sin Empresa Explicita' },
      [unit.businessUnitId]
    )) as { branchOfficeId: number; businessUnitId: number }

    assert.equal(creada.businessUnitId, unit.businessUnitId)
  })

  test('el alta con una empresa fuera del scope sigue rechazada', async ({ assert }) => {
    unit = await createUnit('scope-ajeno')

    let error: BranchOfficeServiceError | null = null
    try {
      await BranchOfficeService.create(
        { businessUnitId: unit.businessUnitId + 99999, branchOfficeName: 'Sucursal Ajena' },
        [unit.businessUnitId]
      )
    } catch (e) {
      error = e as BranchOfficeServiceError
    }

    assert.exists(error, 'el scope sigue mandando sobre lo que llega en el cuerpo')
    assert.equal(error?.errorCode, BRANCH_OFFICE_ERROR_CODES.BU_NOT_ALLOWED)
  })

  test('la sucursal que siembra el alta de la empresa nace sin domicilio', async ({ assert }) => {
    unit = await createUnit('sin-domicilio')

    const sembrada = await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)

    assert.isNull(sembrada.branchOfficeStreet, 'el alta no puede inventar un domicilio')
    assert.isNull(sembrada.branchOfficeCity)
    assert.isNull(sembrada.branchOfficeState)
  })

  test('la edicion cambia el domicilio sin tocar la geocerca', async ({ assert }) => {
    unit = await createUnit('edita-domicilio')
    const sede = await createBranch(unit, 'Sede Editable')

    await BranchOfficeService.update(
      sede.branchOfficeId,
      { branchOfficeStreet: 'Calle Nueva 100', branchOfficeCity: 'Lerma' },
      [unit.businessUnitId]
    )

    await sede.refresh()
    assert.equal(sede.branchOfficeStreet, 'Calle Nueva 100')
    assert.equal(sede.branchOfficeCity, 'Lerma')
    assert.isNull(sede.branchOfficeLocationAddress, 'la geocerca es dato aparte y no se toca')
  })
})

test.group('Marca de sucursal default', (group) => {
  let unit: BusinessUnit | null = null

  group.each.teardown(async () => {
    await cleanupUnit(unit)
    unit = null
  })

  test('marcar otra sucursal como default transfiere la marca', async ({ assert }) => {
    unit = await createUnit('transfiere')
    const original = await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)
    const nueva = await createBranch(unit, 'Nueva Matriz')

    await BranchOfficeService.update(
      nueva.branchOfficeId,
      { branchOfficeIsDefault: true },
      [unit.businessUnitId]
    )

    await original.refresh()
    await nueva.refresh()

    assert.equal(nueva.branchOfficeIsDefault, 1, 'la nueva toma la marca')
    assert.equal(original.branchOfficeIsDefault, 0, 'la anterior la pierde y ya se puede eliminar')
  })

  test('la marca default no se apaga: solo se transfiere', async ({ assert }) => {
    unit = await createUnit('no-apaga')
    const defaultBranch = await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)

    let error: BranchOfficeServiceError | null = null
    try {
      await BranchOfficeService.update(
        defaultBranch.branchOfficeId,
        { branchOfficeIsDefault: false },
        [unit.businessUnitId]
      )
    } catch (e) {
      error = e as BranchOfficeServiceError
    }

    assert.exists(error)
    assert.equal(error?.key, 'default-no-se-desmarca')
    assert.equal(error?.httpStatus, 409)

    await defaultBranch.refresh()
    assert.equal(defaultBranch.branchOfficeIsDefault, 1)
  })

  test('el listado dice cuántos empleados activos tiene cada sucursal', async ({ assert }) => {
    unit = await createUnit('conteo')
    await BranchOfficeProvisioningService.ensureDefault(unit.businessUnitId)
    const sede = await createBranch(unit, 'Sede Poblada')
    await createEmployeeIn(unit, sede)
    await createEmployeeIn(unit, sede)

    const listado = (await BranchOfficeService.getAll(
      { businessUnitId: unit.businessUnitId },
      [unit.businessUnitId]
    )) as { data: Array<{ branchOfficeId: number; activeEmployeesCount: number }> }

    const fila = listado.data.find((row) => row.branchOfficeId === sede.branchOfficeId)
    assert.exists(fila)
    assert.equal(fila!.activeEmployeesCount, 2)
  })
})

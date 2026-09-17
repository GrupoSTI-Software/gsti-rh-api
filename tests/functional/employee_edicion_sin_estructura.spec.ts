import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Department from '#models/department'
import Position from '#models/position'
import Employee from '#models/employee'

/**
 * USRH1788466831270 — editar y dar de baja a un empleado aunque no tenga
 * departamento ni puesto, y aceptar solo estructura vigente de SU empresa al
 * asignarle una distinta. Punta a punta por HTTP con el usuario principal
 * (`root`): tiene acceso a las dos empresas, así que si un departamento
 * ajeno se rechaza es porque cuenta la empresa del empleado y no el alcance
 * de quien captura. Corre sobre la base de desarrollo y borra todo en
 * teardown.
 */

const TEST_PASSWORD = 'EditarSinEstructura123!'
const NONEXISTENT_ID = 2_000_000_000

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Edicion ${label} ${s}`,
    businessUnitSlug: `edicion-${label}-${s}`,
    businessUnitLegalName: `Edicion ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createDepartment(unit: BusinessUnit, label: string): Promise<Department> {
  const s = stamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `EDI-${s}`.slice(0, 50),
    departmentName: `Edicion ${label} ${s}`,
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

async function createPosition(unit: BusinessUnit, label: string): Promise<Position> {
  const s = stamp()
  return Position.create({
    positionSyncId: Date.now() + Math.floor(Math.random() * 1000),
    positionCode: `EDI-${s}`.slice(0, 50),
    positionName: `Edicion ${label} ${s}`.slice(0, 100),
    positionActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

interface EmployeeFixture {
  employee: Employee
  person: Person
}

async function createEmployee(
  unit: BusinessUnit,
  label: string,
  structure: { departmentId: number | null; positionId: number | null }
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Edicion',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `edicion-${label}-${s}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `EDI-${s}`
  employee.employeeFirstName = 'Edicion'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `EDI-${s}`
  employee.employeeBusinessEmail = person.personEmail!
  employee.companyId = unit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.employeeTypeId = 1
  employee.departmentId = structure.departmentId
  employee.positionId = structure.positionId
  employee.employeeTerminatedDate = null
  await employee.save()
  return { employee, person }
}

interface Actor {
  user: User
  person: Person
}

/** El usuario principal: rol `root` del sistema, con acceso a todas las empresas. */
async function createRootActor(unit: BusinessUnit): Promise<Actor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  const s = stamp()
  const email = `edicion-root-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'Root',
    personSecondLastname: s,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([unit.businessUnitId])
  return { user, person }
}

async function cleanupEmployees(fixtures: EmployeeFixture[]): Promise<void> {
  for (const { employee, person } of fixtures) {
    // La baja abre un expediente de salida (FK RESTRICT a `employees`); sus
    // pendientes caen en cascada al borrar el expediente.
    await db.from('employee_offboardings').where('employee_id', employee.employeeId).delete()
    await db.from('employee_salary_history').where('employee_id', employee.employeeId).delete()
    await Employee.query().withTrashed().where('employee_id', employee.employeeId).delete()
    await Person.query().where('person_id', person.personId).delete()
  }
}

async function cleanupActor(actor: Actor | null): Promise<void> {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function cleanupUnits(units: BusinessUnit[]): Promise<void> {
  for (const unit of units) {
    await Position.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await Department.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

/**
 * Body equivalente al eco del BO (`buildEmployeeBody`): el registro completo,
 * con `departmentId` y `positionId` tal como los tiene el empleado (incluido
 * `null`). `overrides` es lo que "cambia el usuario" en la ficha.
 */
function bodyFor(fixture: EmployeeFixture, overrides: Record<string, unknown> = {}) {
  const employee = fixture.employee
  return {
    employeeCode: String(employee.employeeCode),
    employeeFirstName: employee.employeeFirstName ?? '',
    employeeLastName: employee.employeeLastName ?? '',
    employeeSecondLastName: employee.employeeSecondLastName ?? '',
    companyId: employee.companyId,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    employeeTypeId: employee.employeeTypeId,
    businessUnitId: employee.businessUnitId,
    payrollBusinessUnitId: employee.payrollBusinessUnitId,
    employeeBusinessEmail: employee.employeeBusinessEmail,
    employeeWorkSchedule: 'Onsite',
    employeeWorkScheduleHybridConfig: null,
    ...overrides,
  }
}

async function snapshot(employeeId: number) {
  return db
    .from('employees')
    .where('employee_id', employeeId)
    .select([
      'department_id',
      'position_id',
      'position_level_config_id',
      'business_unit_id',
      'payroll_business_unit_id',
      'employee_business_email',
      'employee_terminated_date',
      'employee_termination_modality',
      'employee_termination_type',
    ])
    .first()
}

test.group('Edición y baja sin estructura — PUT/DELETE /api/employees/:id (USRH1788466831270)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let root: Actor | null = null
  let activeDepartment: Department
  let activePosition: Position
  let deletedDepartment: Department
  let foreignDepartment: Department
  let foreignPosition: Position
  let sinEstructura: EmployeeFixture
  let sinEstructuraAsignar: EmployeeFixture
  let sinEstructuraRechazos: EmployeeFixture
  let sinEstructuraBajaPut: EmployeeFixture
  let sinEstructuraBajaDelete: EmployeeFixture
  let deptoEliminado: EmployeeFixture
  let conEstructura: EmployeeFixture

  group.setup(async () => {
    unit = await createUnit('empresa')
    foreignUnit = await createUnit('ajena')
    activeDepartment = await createDepartment(unit, 'Activo')
    activePosition = await createPosition(unit, 'Activo')
    deletedDepartment = await createDepartment(unit, 'Eliminado')
    foreignDepartment = await createDepartment(foreignUnit, 'Ajeno')
    foreignPosition = await createPosition(foreignUnit, 'Ajeno')

    const none = { departmentId: null, positionId: null }
    sinEstructura = await createEmployee(unit, 'SinEstructura', none)
    sinEstructuraAsignar = await createEmployee(unit, 'Asignar', none)
    sinEstructuraRechazos = await createEmployee(unit, 'Rechazos', none)
    sinEstructuraBajaPut = await createEmployee(unit, 'BajaPut', none)
    sinEstructuraBajaDelete = await createEmployee(unit, 'BajaDelete', none)
    deptoEliminado = await createEmployee(unit, 'DeptoEliminado', {
      departmentId: deletedDepartment.departmentId,
      positionId: activePosition.positionId,
    })
    conEstructura = await createEmployee(unit, 'ConEstructura', {
      departmentId: activeDepartment.departmentId,
      positionId: activePosition.positionId,
    })
    // El departamento se elimina DESPUÉS de asignarlo: es el caso "apunta a
    // un departamento que ya se eliminó en el Organigrama".
    await deletedDepartment.delete()

    root = await createRootActor(unit)
    await root.user.related('businessUnits').attach([foreignUnit.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupEmployees([
      sinEstructura,
      sinEstructuraAsignar,
      sinEstructuraRechazos,
      sinEstructuraBajaPut,
      sinEstructuraBajaDelete,
      deptoEliminado,
      conEstructura,
    ])
    await cleanupActor(root)
    await cleanupUnits([unit, foreignUnit])
  })

  function put(fixture: EmployeeFixture, overrides: Record<string, unknown> = {}) {
    return (client: ApiClient) =>
      client
        .put(`/api/employees/${fixture.employee.employeeId}`)
        .loginAs(root!.user)
        .header('X-Business-Unit-Id', unit.businessUnitPublicId)
        .json(bodyFor(fixture, overrides))
  }

  test('corrige el correo de un empleado sin departamento ni puesto; siguen vacíos (reglas 1 y 2)', async ({
    client,
    assert,
  }) => {
    const nuevoCorreo = `edicion-corregido-${stamp()}@gsti-tests.local`
    const response = await put(sinEstructura, { employeeBusinessEmail: nuevoCorreo })(client)

    response.assertStatus(201)
    const row = await snapshot(sinEstructura.employee.employeeId)
    assert.equal(row.employee_business_email, nuevoCorreo)
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)
    assert.isNull(response.body().data.employee.departmentId)
    assert.isNull(response.body().data.employee.positionId)
  })

  test('registra la baja desde la ficha (PUT) sin pedir estructura (regla 1)', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraBajaPut, {
      employeeTerminatedDate: '2026-09-15',
      employeeTerminationModality: 'Renuncia',
      employeeTerminationType: 'Cambio de Residencia',
    })(client)

    response.assertStatus(201)
    const row = await snapshot(sinEstructuraBajaPut.employee.employeeId)
    assert.isNotNull(row.employee_terminated_date)
    assert.equal(row.employee_termination_modality, 'Renuncia')
    assert.equal(row.employee_termination_type, 'Cambio de Residencia')
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)
  })

  test('registra la baja desde la lista (DELETE) sin pedir estructura', async ({
    client,
    assert,
  }) => {
    const response = await client
      .delete(`/api/employees/${sinEstructuraBajaDelete.employee.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      .json({
        employeeTerminatedDate: '2026-09-15',
        employeeTerminationModality: 'Renuncia',
        employeeTerminationType: 'Cambio de Residencia',
      })

    response.assertStatus(201)
    const row = await snapshot(sinEstructuraBajaDelete.employee.employeeId)
    assert.isNotNull(row.employee_terminated_date)
    assert.isNull(row.department_id)
  })

  test('asigna un departamento y un puesto vigentes de su empresa (regla 3)', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraAsignar, {
      departmentId: activeDepartment.departmentId,
      positionId: activePosition.positionId,
    })(client)

    response.assertStatus(201)
    const row = await snapshot(sinEstructuraAsignar.employee.employeeId)
    assert.equal(row.department_id, activeDepartment.departmentId)
    assert.equal(row.position_id, activePosition.positionId)
  })

  test('el eco de un departamento ya eliminado no bloquea y se conserva (regla 4)', async ({
    client,
    assert,
  }) => {
    const nuevoCorreo = `edicion-eliminado-${stamp()}@gsti-tests.local`
    const response = await put(deptoEliminado, { employeeBusinessEmail: nuevoCorreo })(client)

    response.assertStatus(201)
    const row = await snapshot(deptoEliminado.employee.employeeId)
    assert.equal(row.employee_business_email, nuevoCorreo)
    assert.equal(row.department_id, deletedDepartment.departmentId)
    assert.equal(row.position_id, activePosition.positionId)
  })

  test('rechaza un departamento de otra empresa aunque quien captura tenga acceso a las dos (regla 3)', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraRechazos, {
      departmentId: foreignDepartment.departmentId,
    })(client)

    response.assertStatus(400)
    assert.equal(response.body().type, 'warning')
    assert.equal(response.body().message, 'El departamento no existe en la empresa del empleado')
    const row = await snapshot(sinEstructuraRechazos.employee.employeeId)
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)
  })

  test('rechaza un puesto de otra empresa con el mensaje de puesto (regla 3)', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraRechazos, {
      positionId: foreignPosition.positionId,
    })(client)

    response.assertStatus(400)
    assert.equal(response.body().message, 'El puesto no existe en la empresa del empleado')
    const row = await snapshot(sinEstructuraRechazos.employee.employeeId)
    assert.isNull(row.position_id)
  })

  test('regla 6: eliminado e inexistente reciben exactamente el mismo mensaje que el ajeno', async ({
    client,
    assert,
  }) => {
    for (const departmentId of [deletedDepartment.departmentId, NONEXISTENT_ID]) {
      const response = await put(sinEstructuraRechazos, { departmentId })(client)
      response.assertStatus(400)
      assert.equal(response.body().message, 'El departamento no existe en la empresa del empleado')
    }
    const row = await snapshot(sinEstructuraRechazos.employee.employeeId)
    assert.isNull(row.department_id)
  })

  test('regla 5: al cambiar de empresa, el departamento que tenía se revisa contra la nueva y se rechaza', async ({
    client,
    assert,
  }) => {
    const response = await put(conEstructura, {
      businessUnitId: foreignUnit.businessUnitId,
      payrollBusinessUnitId: foreignUnit.businessUnitId,
    })(client)

    response.assertStatus(400)
    assert.equal(response.body().message, 'El departamento no existe en la empresa del empleado')
    const row = await snapshot(conEstructura.employee.employeeId)
    assert.equal(row.department_id, activeDepartment.departmentId)
    assert.equal(row.position_id, activePosition.positionId)
    assert.equal(row.business_unit_id, unit.businessUnitId)
  })

  test('regla 5: al cambiar de empresa y asignar estructura válida de la nueva, se acepta', async ({
    client,
    assert,
  }) => {
    const response = await put(conEstructura, {
      businessUnitId: foreignUnit.businessUnitId,
      payrollBusinessUnitId: foreignUnit.businessUnitId,
      departmentId: foreignDepartment.departmentId,
      positionId: foreignPosition.positionId,
    })(client)

    response.assertStatus(201)
    const row = await snapshot(conEstructura.employee.employeeId)
    assert.equal(row.business_unit_id, foreignUnit.businessUnitId)
    assert.equal(row.payroll_business_unit_id, foreignUnit.businessUnitId)
    assert.equal(row.department_id, foreignDepartment.departmentId)
    assert.equal(row.position_id, foreignPosition.positionId)
  })

  test('regla 7: a un empleado sin puesto no se le asigna un nivel de puesto', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraRechazos, {
      positionLevelConfigId: NONEXISTENT_ID,
    })(client)

    response.assertStatus(422)
    assert.equal(response.body().code, 'ELVL.CONF.001')
    const row = await snapshot(sinEstructuraRechazos.employee.employeeId)
    assert.isNull(row.position_level_config_id)
  })

  test('regla 8: un dato mal formado es 400 con mensaje, no la pantalla de error general', async ({
    client,
    assert,
  }) => {
    const response = await put(sinEstructuraRechazos, { departmentId: 0 })(client)

    response.assertStatus(400)
    assert.equal(response.body().type, 'warning')
    assert.equal(response.body().title, 'Error de validación')
    assert.isString(response.body().message)
    assert.isNotEmpty(response.body().message)
    assert.notEqual(response.body().title, 'Server error')
  })
})

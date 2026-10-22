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
import { linkDepartmentPositionFixture } from '#tests/helpers/org_chart_fixtures'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'

/**
 * VLRH-H1792361820794 — el alta y la edición exigen que el departamento del
 * empleado sea el del puesto. En la edición solo si cambia la estructura.
 */

const TEST_PASSWORD = 'CoherenciaPuestoDepto123!'

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Coherencia ${label} ${s}`,
    businessUnitSlug: `coherencia-${label}-${s}`,
    businessUnitLegalName: `Coherencia ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createDepartment(unit: BusinessUnit, label: string): Promise<Department> {
  const s = stamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `COH-${s}`.slice(0, 50),
    departmentName: `Coherencia ${label} ${s}`,
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
    positionCode: `COH-${s}`.slice(0, 50),
    positionName: `Coherencia ${label} ${s}`.slice(0, 100),
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
    personFirstname: 'Coherencia',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `coherencia-${label}-${s}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `COH-${s}`
  employee.employeeFirstName = 'Coherencia'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `COH-${s}`
  employee.employeeBusinessEmail = person.personEmail!
  employee.companyId = unit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.employeeTypeId = 1
  employee.departmentId = structure.departmentId
  employee.positionId = structure.positionId
  employee.employeeTerminatedDate = null
  await TenantContext.runUnscoped(() => employee.save(), TENANT_UNSCOPED_REASON.TEST_FIXTURE)
  return { employee, person }
}

interface Actor {
  user: User
  person: Person
}

async function createRootActor(unit: BusinessUnit): Promise<Actor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  const s = stamp()
  const email = `coherencia-root-${s}@gsti-tests.local`
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

async function snapshot(employeeId: number) {
  return db
    .from('employees')
    .where('employee_id', employeeId)
    .select([
      'department_id',
      'position_id',
      'business_unit_id',
      'employee_business_email',
      'employee_first_name',
    ])
    .first()
}

function containsExactId(value: unknown, id: number): boolean {
  if (value === id) return true
  if (typeof value === 'string' && value === String(id)) return true
  if (Array.isArray(value)) return value.some((item) => containsExactId(item, id))
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((item) => containsExactId(item, id))
  }
  return false
}

test.group('Coherencia puesto y departamento — alta y edición (VLRH-H1792361820794)', (group) => {
  let company: BusinessUnit
  let otherCompany: BusinessUnit
  let foreignCompany: BusinessUnit
  let root: Actor | null = null
  let production: Department
  let sales: Department
  let humanResources: Department
  let otherDepartment: Department
  let foreignDepartment: Department
  let lineSupervisor: Position
  let payrollAnalyst: Position
  let unlinkedPosition: Position
  let otherPosition: Position

  const createdEmployees: EmployeeFixture[] = []

  group.setup(async () => {
    company = await createUnit('empresa')
    otherCompany = await createUnit('destino')
    foreignCompany = await createUnit('ajena')
    production = await createDepartment(company, 'Produccion')
    sales = await createDepartment(company, 'Ventas')
    humanResources = await createDepartment(company, 'RecursosHumanos')
    otherDepartment = await createDepartment(otherCompany, 'Destino')
    foreignDepartment = await createDepartment(foreignCompany, 'Ajeno')
    lineSupervisor = await createPosition(company, 'Supervisor')
    payrollAnalyst = await createPosition(company, 'Analista')
    unlinkedPosition = await createPosition(company, 'SinVinculo')
    otherPosition = await createPosition(otherCompany, 'Destino')
    await linkDepartmentPositionFixture(
      production.departmentId,
      lineSupervisor.positionId,
      company.businessUnitId
    )
    await linkDepartmentPositionFixture(
      humanResources.departmentId,
      payrollAnalyst.positionId,
      company.businessUnitId
    )
    await linkDepartmentPositionFixture(
      otherDepartment.departmentId,
      otherPosition.positionId,
      otherCompany.businessUnitId
    )
    await linkDepartmentPositionFixture(
      foreignDepartment.departmentId,
      lineSupervisor.positionId,
      foreignCompany.businessUnitId
    )
    root = await createRootActor(company)
    await root.user.related('businessUnits').attach([
      otherCompany.businessUnitId,
      foreignCompany.businessUnitId,
    ])
  })

  group.teardown(async () => {
    for (const fixture of createdEmployees) {
      await db.from('user_responsible_employees').where('employee_id', fixture.employee.employeeId).delete()
      await db.from('employee_offboardings').where('employee_id', fixture.employee.employeeId).delete()
      await db.from('employee_salary_history').where('employee_id', fixture.employee.employeeId).delete()
      await Employee.query().withTrashed().where('employee_id', fixture.employee.employeeId).delete()
      await Person.query().withTrashed().where('person_id', fixture.person.personId).delete()
    }
    if (root) {
      await BusinessUnitUser.query().where('user_id', root.user.userId).delete()
      await User.query().where('user_id', root.user.userId).delete()
      await Person.query().withTrashed().where('person_id', root.person.personId).delete()
    }
    for (const unit of [company, otherCompany, foreignCompany]) {
      const people = await db.from('employees').where('business_unit_id', unit.businessUnitId).select('person_id', 'employee_id')
      const employeeIds = people.map((row) => Number(row.employee_id))
      if (employeeIds.length > 0) {
        await db.from('user_responsible_employees').whereIn('employee_id', employeeIds).delete()
        await db.from('employee_offboardings').whereIn('employee_id', employeeIds).delete()
        await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
        await db.from('employees').whereIn('employee_id', employeeIds).delete()
      }
      const personIds = people.map((row) => Number(row.person_id))
      if (personIds.length > 0) {
        await db.from('people').whereIn('person_id', personIds).delete()
      }
      await db.from('department_position').where('business_unit_id', unit.businessUnitId).delete()
      await db.from('department_position').whereIn(
        'position_id',
        [lineSupervisor.positionId, payrollAnalyst.positionId, unlinkedPosition.positionId, otherPosition.positionId]
      ).delete()
      await Position.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
      await Department.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
      await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
    }
  })

  function storeBody(person: Person, overrides: Record<string, unknown> = {}) {
    const s = stamp()
    return {
      employeeFirstName: 'Alta',
      employeeLastName: 'Coherencia',
      employeeSecondLastName: 'QA',
      employeeCode: `COH-${s}`,
      employeePayrollNum: `COH-PN-${s}`,
      companyId: company.businessUnitId,
      personId: person.personId,
      employeeTypeId: 1,
      businessUnitId: company.businessUnitId,
      payrollBusinessUnitId: company.businessUnitId,
      employeeWorkSchedule: 'Onsite',
      employeeWorkScheduleHybridConfig: null,
      employeeBusinessEmail: person.personEmail,
      ...overrides,
    }
  }

  function post(client: ApiClient, person: Person, overrides: Record<string, unknown> = {}) {
    return client
      .post('/api/employees')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', company.businessUnitPublicId)
      .json(storeBody(person, overrides))
  }

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

  function put(client: ApiClient, fixture: EmployeeFixture, overrides: Record<string, unknown> = {}) {
    return client
      .put(`/api/employees/${fixture.employee.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', company.businessUnitPublicId)
      .json(bodyFor(fixture, overrides))
  }

  async function hire(label: string, structure: { departmentId: number | null; positionId: number | null }) {
    const fixture = await createEmployee(company, label, structure)
    createdEmployees.push(fixture)
    return fixture
  }

  test('CA1 alta coherente', async ({ client, assert }) => {
    const person = await Person.create({
      personFirstname: 'Alta',
      personLastname: 'Coherente',
      personSecondLastname: stamp(),
      personEmail: `coherencia-alta-ok-${stamp()}@gsti-tests.local`,
      businessUnitId: company.businessUnitId,
    })
    const response = await post(client, person, {
      departmentId: humanResources.departmentId,
      positionId: payrollAnalyst.positionId,
    })

    response.assertStatus(201)
    assert.equal(response.body().data.employee.departmentId, humanResources.departmentId)
    assert.equal(response.body().data.employee.positionId, payrollAnalyst.positionId)
    createdEmployees.push({
      employee: { employeeId: Number(response.body().data.employee.employeeId) } as Employee,
      person,
    })
  })

  test('CA2 alta con puesto de otro departamento', async ({ client, assert }) => {
    const person = await Person.create({
      personFirstname: 'Alta',
      personLastname: 'Descuadrada',
      personSecondLastname: stamp(),
      personEmail: `coherencia-alta-mal-${stamp()}@gsti-tests.local`,
      businessUnitId: company.businessUnitId,
    })
    const response = await post(client, person, {
      departmentId: sales.departmentId,
      positionId: lineSupervisor.positionId,
    })

    response.assertStatus(422)
    assert.equal(response.body().type, 'warning')
    assert.equal(response.body().key, 'consistencia-puesto-departamento')
    assert.equal(response.body().title, 'Inconsistencia entre puesto y departamento')
    assert.equal(
      response.body().message,
      `El puesto ${lineSupervisor.positionName} pertenece al departamento ${production.departmentName}.`
    )
    assert.deepEqual(response.body().data, {
      departmentId: sales.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const createdEmployee = await db
      .from('employees')
      .where('person_id', person.personId)
      .whereNull('employee_deleted_at')
      .first()
    assert.isNull(createdEmployee)
    const livePerson = await db
      .from('people')
      .where('person_id', person.personId)
      .whereNull('person_deleted_at')
      .first()
    assert.isNull(livePerson)
    await db.from('people').where('person_id', person.personId).delete()
  })

  test('CA3 alta con puesto sin departamento', async ({ client, assert }) => {
    const person = await Person.create({
      personFirstname: 'Alta',
      personLastname: 'SinVinculo',
      personSecondLastname: stamp(),
      personEmail: `coherencia-alta-huerfano-${stamp()}@gsti-tests.local`,
      businessUnitId: company.businessUnitId,
    })
    const response = await post(client, person, {
      departmentId: sales.departmentId,
      positionId: unlinkedPosition.positionId,
    })

    response.assertStatus(422)
    assert.equal(response.body().key, 'vinculo-departamento-faltante')
    assert.equal(
      response.body().message,
      'El puesto elegido no pertenece a ningún departamento de la empresa del empleado.'
    )
    const createdEmployee = await db
      .from('employees')
      .where('person_id', person.personId)
      .whereNull('employee_deleted_at')
      .first()
    assert.isNull(createdEmployee)
    await db.from('people').where('person_id', person.personId).delete()
  })

  test('CA4 editar otro dato de un descuadrado, con eco y sin claves', async ({ client, assert }) => {
    const mismatched = await hire('Descuadrado', {
      departmentId: sales.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const echoedEmail = `coherencia-eco-${stamp()}@gsti-tests.local`
    const echoed = await put(client, mismatched, { employeeBusinessEmail: echoedEmail })

    echoed.assertStatus(201)
    let row = await snapshot(mismatched.employee.employeeId)
    assert.equal(row.employee_business_email, echoedEmail)
    assert.equal(row.department_id, sales.departmentId)
    assert.equal(row.position_id, lineSupervisor.positionId)

    const omittedEmail = `coherencia-sin-claves-${stamp()}@gsti-tests.local`
    const withoutKeys: Record<string, unknown> = bodyFor(mismatched, {
      employeeBusinessEmail: omittedEmail,
    })
    delete withoutKeys.departmentId
    delete withoutKeys.positionId
    const omitted = await client
      .put(`/api/employees/${mismatched.employee.employeeId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', company.businessUnitPublicId)
      .json(withoutKeys)

    omitted.assertStatus(201)
    row = await snapshot(mismatched.employee.employeeId)
    assert.equal(row.employee_business_email, omittedEmail)
    assert.equal(row.department_id, sales.departmentId)
    assert.equal(row.position_id, lineSupervisor.positionId)
  })

  test('CA5 cambiar solo el puesto se rechaza; cambiar ambos coherentes se guarda', async ({
    client,
    assert,
  }) => {
    const employee = await hire('CambiarPuesto', {
      departmentId: production.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const rejectedEmail = `coherencia-rechazo-puesto-${stamp()}@gsti-tests.local`
    const rejected = await put(client, employee, {
      positionId: payrollAnalyst.positionId,
      employeeBusinessEmail: rejectedEmail,
    })

    rejected.assertStatus(422)
    assert.equal(rejected.body().key, 'consistencia-puesto-departamento')
    const unchanged = await snapshot(employee.employee.employeeId)
    assert.equal(unchanged.department_id, production.departmentId)
    assert.equal(unchanged.position_id, lineSupervisor.positionId)
    assert.equal(unchanged.employee_business_email, employee.employee.employeeBusinessEmail)

    const accepted = await put(client, employee, {
      departmentId: humanResources.departmentId,
      positionId: payrollAnalyst.positionId,
    })
    accepted.assertStatus(201)
    const row = await snapshot(employee.employee.employeeId)
    assert.equal(row.department_id, humanResources.departmentId)
    assert.equal(row.position_id, payrollAnalyst.positionId)
  })

  test('CA6 vaciar solo el departamento se rechaza; vaciar ambos o solo el puesto se guarda', async ({
    client,
    assert,
  }) => {
    const keepPosition = await hire('VaciarDepto', {
      departmentId: production.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const rejected = await put(client, keepPosition, {
      departmentId: null,
      employeeBusinessEmail: `coherencia-vaciar-depto-${stamp()}@gsti-tests.local`,
    })
    rejected.assertStatus(422)
    assert.equal(rejected.body().key, 'puesto-sin-departamento')
    const kept = await snapshot(keepPosition.employee.employeeId)
    assert.equal(kept.department_id, production.departmentId)
    assert.equal(kept.position_id, lineSupervisor.positionId)
    assert.equal(kept.employee_business_email, keepPosition.employee.employeeBusinessEmail)

    const clearBoth = await hire('VaciarAmbos', {
      departmentId: production.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const both = await put(client, clearBoth, { departmentId: null, positionId: null })
    both.assertStatus(201)
    const emptied = await snapshot(clearBoth.employee.employeeId)
    assert.isNull(emptied.department_id)
    assert.isNull(emptied.position_id)

    const clearPosition = await hire('VaciarPuesto', {
      departmentId: production.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const onlyPosition = await put(client, clearPosition, { positionId: null })
    onlyPosition.assertStatus(201)
    const positionCleared = await snapshot(clearPosition.employee.employeeId)
    assert.equal(positionCleared.department_id, production.departmentId)
    assert.isNull(positionCleared.position_id)
  })

  test('CA7 asignar solo el puesto a quien no tiene estructura se rechaza', async ({
    client,
    assert,
  }) => {
    const empty = await hire('SinEstructura', { departmentId: null, positionId: null })
    const response = await put(client, empty, {
      positionId: lineSupervisor.positionId,
      employeeBusinessEmail: `coherencia-solo-puesto-${stamp()}@gsti-tests.local`,
    })

    response.assertStatus(422)
    assert.equal(response.body().key, 'puesto-sin-departamento')
    const row = await snapshot(empty.employee.employeeId)
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)
    assert.equal(row.employee_business_email, empty.employee.employeeBusinessEmail)
  })

  test('CA8 al cambiar de empresa se revisa el par de la empresa nueva', async ({ client, assert }) => {
    const moving = await hire('CambiarEmpresa', {
      departmentId: production.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const accepted = await put(client, moving, {
      businessUnitId: otherCompany.businessUnitId,
      payrollBusinessUnitId: otherCompany.businessUnitId,
      departmentId: otherDepartment.departmentId,
      positionId: otherPosition.positionId,
    })
    accepted.assertStatus(201)
    const moved = await snapshot(moving.employee.employeeId)
    assert.equal(moved.business_unit_id, otherCompany.businessUnitId)
    assert.equal(moved.department_id, otherDepartment.departmentId)
    assert.equal(moved.position_id, otherPosition.positionId)

    const wrong = await hire('EmpresaIncoherente', {
      departmentId: production.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const loose = await createPosition(otherCompany, 'Suelto')
    const looseDepartment = await createDepartment(otherCompany, 'Suelto')
    await linkDepartmentPositionFixture(
      looseDepartment.departmentId,
      loose.positionId,
      otherCompany.businessUnitId
    )
    const rejected = await put(client, wrong, {
      businessUnitId: otherCompany.businessUnitId,
      payrollBusinessUnitId: otherCompany.businessUnitId,
      departmentId: otherDepartment.departmentId,
      positionId: loose.positionId,
      employeeBusinessEmail: `coherencia-empresa-${stamp()}@gsti-tests.local`,
    })

    rejected.assertStatus(422)
    assert.equal(rejected.body().key, 'consistencia-puesto-departamento')
    assert.include(rejected.body().message, loose.positionName)
    assert.notInclude(rejected.body().message, production.departmentName)
    assert.notInclude(rejected.body().message, lineSupervisor.positionName)
    const stayed = await snapshot(wrong.employee.employeeId)
    assert.equal(stayed.business_unit_id, company.businessUnitId)
    assert.equal(stayed.department_id, production.departmentId)
    assert.equal(stayed.position_id, lineSupervisor.positionId)
  })

  test('CA9 un vínculo de otra empresa no cuenta ni se nombra', async ({ client, assert }) => {
    const aligned = await hire('IgnoraAjena', {
      departmentId: sales.departmentId,
      positionId: payrollAnalyst.positionId,
    })
    const accepted = await put(client, aligned, {
      departmentId: production.departmentId,
      positionId: lineSupervisor.positionId,
    })
    accepted.assertStatus(201)

    const crossed = await hire('NoRevelaAjena', {
      departmentId: production.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const rejected = await put(client, crossed, { departmentId: sales.departmentId })
    rejected.assertStatus(422)
    assert.equal(rejected.body().key, 'consistencia-puesto-departamento')
    const serialized = JSON.stringify(rejected.body())
    assert.notInclude(serialized, foreignDepartment.departmentName)
    assert.isFalse(containsExactId(rejected.body(), foreignDepartment.departmentId))
    const row = await snapshot(crossed.employee.employeeId)
    assert.equal(row.department_id, production.departmentId)
    assert.equal(row.position_id, lineSupervisor.positionId)
  })

  test('CA11 el puesto de otra empresa sigue siendo 400 y no llega a la coherencia', async ({
    client,
    assert,
  }) => {
    const employee = await hire('PuestoAjeno', {
      departmentId: production.departmentId,
      positionId: lineSupervisor.positionId,
    })
    const response = await put(client, employee, { positionId: otherPosition.positionId })

    response.assertStatus(400)
    assert.equal(response.body().message, 'El puesto no existe en la empresa del empleado')
    assert.notEqual(response.body().key, 'consistencia-puesto-departamento')
    const row = await snapshot(employee.employee.employeeId)
    assert.equal(row.position_id, lineSupervisor.positionId)
  })
})

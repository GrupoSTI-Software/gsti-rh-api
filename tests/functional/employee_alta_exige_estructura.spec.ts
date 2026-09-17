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
 * USRH1789328927556 — el alta exige departamento y puesto de la empresa del
 * empleado, no rellena, y cada rechazo es un mensaje (nunca 500). Punta a
 * punta por HTTP con `root`: tiene acceso a las dos empresas, así que si un
 * departamento ajeno se rechaza es porque cuenta la empresa del empleado.
 * Corre sobre la base de desarrollo y borra todo en teardown.
 */

const TEST_PASSWORD = 'AltaExigeEstructura123!'
const NONEXISTENT_ID = 2_000_000_000

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Alta ${label} ${s}`,
    businessUnitSlug: `alta-${label}-${s}`,
    businessUnitLegalName: `Alta ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createDepartment(unit: BusinessUnit, label: string): Promise<Department> {
  const s = stamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `ALT-${s}`.slice(0, 50),
    departmentName: `Alta ${label} ${s}`,
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
    positionCode: `ALT-${s}`.slice(0, 50),
    positionName: `Alta ${label} ${s}`.slice(0, 100),
    positionActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

interface Actor {
  user: User
  person: Person
}

async function createRootActor(unit: BusinessUnit): Promise<Actor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  const s = stamp()
  const email = `alta-root-${s}@gsti-tests.local`
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

async function createPerson(email: string): Promise<Person> {
  return Person.create({
    personFirstname: 'Alta',
    personLastname: 'Estructura',
    personSecondLastname: stamp(),
    personEmail: email,
  })
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

async function cleanupPerson(person: Person | null): Promise<void> {
  if (!person) return
  const employee = await Employee.query()
    .withTrashed()
    .where('person_id', person.personId)
    .first()
  if (employee) {
    await db.from('user_responsible_employees').where('employee_id', employee.employeeId).delete()
    await db.from('employee_offboardings').where('employee_id', employee.employeeId).delete()
    await db.from('employee_salary_history').where('employee_id', employee.employeeId).delete()
    await Employee.query().withTrashed().where('employee_id', employee.employeeId).delete()
  }
  await Person.query().withTrashed().where('person_id', person.personId).delete()
}

test.group('Alta exige estructura — POST /api/employees (USRH1789328927556)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let root: Actor | null = null
  let activeDepartment: Department
  let activePosition: Position
  let deletedDepartment: Department
  let foreignDepartment: Department
  let foreignPosition: Position

  group.setup(async () => {
    unit = await createUnit('empresa')
    foreignUnit = await createUnit('ajena')
    activeDepartment = await createDepartment(unit, 'Activo')
    activePosition = await createPosition(unit, 'Activo')
    deletedDepartment = await createDepartment(unit, 'Eliminado')
    foreignDepartment = await createDepartment(foreignUnit, 'Ajeno')
    foreignPosition = await createPosition(foreignUnit, 'Ajeno')
    await deletedDepartment.delete()
    root = await createRootActor(unit)
    await root.user.related('businessUnits').attach([foreignUnit.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupActor(root)
    await cleanupUnits([unit, foreignUnit])
  })

  function storeBody(person: Person, overrides: Record<string, unknown> = {}) {
    const s = stamp()
    return {
      employeeFirstName: 'Alta',
      employeeLastName: 'Estructura',
      employeeSecondLastName: 'QA',
      employeeCode: `ALT-${s}`,
      employeePayrollNum: `ALT-PN-${s}`,
      companyId: unit.businessUnitId,
      personId: person.personId,
      employeeTypeId: 1,
      businessUnitId: unit.businessUnitId,
      payrollBusinessUnitId: unit.businessUnitId,
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
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      .json(storeBody(person, overrides))
  }

  test('sin departamento ni puesto no crea y dice que faltan los dos (reglas 1 y 2)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-ambos-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, { departmentId: 0, positionId: '' })

      response.assertStatus(400)
      assert.equal(response.body().type, 'warning')
      assert.equal(response.body().message, 'Faltan el departamento y el puesto')
      assert.notEqual(response.body().title, 'Server error')
      const created = await Employee.query().where('person_id', person.personId).first()
      assert.isNull(created)
      const released = await Person.query().withTrashed().where('person_id', person.personId).first()
      assert.isNotNull(released?.deletedAt)
    } finally {
      await cleanupPerson(person)
    }
  })

  test('con departamento y sin puesto dice que falta el puesto (regla 1)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-puesto-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: activeDepartment.departmentId,
        positionId: null,
      })

      response.assertStatus(400)
      assert.equal(response.body().message, 'Falta el puesto')
      const created = await Employee.query().where('person_id', person.personId).first()
      assert.isNull(created)
    } finally {
      await cleanupPerson(person)
    }
  })

  test('con puesto y sin departamento dice que falta el departamento (regla 1)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-depto-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: 0,
        positionId: activePosition.positionId,
      })

      response.assertStatus(400)
      assert.equal(response.body().message, 'Falta el departamento')
    } finally {
      await cleanupPerson(person)
    }
  })

  test('con departamento y puesto de su empresa se crea (camino feliz)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-ok-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: activeDepartment.departmentId,
        positionId: activePosition.positionId,
      })

      response.assertStatus(201)
      assert.equal(response.body().type, 'success')
      assert.equal(response.body().data.employee.departmentId, activeDepartment.departmentId)
      assert.equal(response.body().data.employee.positionId, activePosition.positionId)
      const row = await db
        .from('employees')
        .where('person_id', person.personId)
        .whereNull('employee_deleted_at')
        .first()
      assert.equal(row.department_id, activeDepartment.departmentId)
      assert.equal(row.position_id, activePosition.positionId)
    } finally {
      await cleanupPerson(person)
    }
  })

  test('un rechazo no deja la persona a medias: el reintento con el mismo correo procede (regla 5)', async ({
    client,
    assert,
  }) => {
    const email = `alta-reintento-${stamp()}@gsti-tests.local`
    const first = await createPerson(email)
    const rejected = await post(client, first, { departmentId: 0, positionId: 0 })
    rejected.assertStatus(400)

    const second = await createPerson(email)
    try {
      const response = await post(client, second, {
        departmentId: activeDepartment.departmentId,
        positionId: activePosition.positionId,
      })

      response.assertStatus(201)
      assert.equal(response.body().data.employee.departmentId, activeDepartment.departmentId)
    } finally {
      await cleanupPerson(first)
      await cleanupPerson(second)
    }
  })

  test('rechaza un departamento de otra empresa con el mismo mensaje que uno inexistente (regla 3)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-ajeno-${stamp()}@gsti-tests.local`)
    try {
      const foreign = await post(client, person, {
        departmentId: foreignDepartment.departmentId,
        positionId: activePosition.positionId,
      })
      const missing = await post(client, person, {
        departmentId: NONEXISTENT_ID,
        positionId: activePosition.positionId,
      })

      foreign.assertStatus(400)
      missing.assertStatus(400)
      assert.equal(foreign.body().message, 'El departamento no existe en la empresa del empleado')
      assert.equal(missing.body().message, foreign.body().message)
      const created = await Employee.query().where('person_id', person.personId).first()
      assert.isNull(created)
    } finally {
      await cleanupPerson(person)
    }
  })

  test('rechaza un puesto de otra empresa con el mensaje de puesto (regla 3)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-puesto-ajeno-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: activeDepartment.departmentId,
        positionId: foreignPosition.positionId,
      })

      response.assertStatus(400)
      assert.equal(response.body().message, 'El puesto no existe en la empresa del empleado')
    } finally {
      await cleanupPerson(person)
    }
  })

  test('un departamento eliminado usa el mismo mensaje que uno inexistente (regla 3)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-eliminado-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: deletedDepartment.departmentId,
        positionId: activePosition.positionId,
      })

      response.assertStatus(400)
      assert.equal(response.body().message, 'El departamento no existe en la empresa del empleado')
    } finally {
      await cleanupPerson(person)
    }
  })

  test('un dato mal formado sale 400, no 500 (regla 4)', async ({ client, assert }) => {
    const person = await createPerson(`alta-vine-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: activeDepartment.departmentId,
        positionId: activePosition.positionId,
        employeeTypeId: 'no-es-numero',
      })

      response.assertStatus(400)
      assert.equal(response.body().title, 'Error de validación')
      assert.notEqual(response.body().title, 'Server error')
      const created = await Employee.query().where('person_id', person.personId).first()
      assert.isNull(created)
    } finally {
      await cleanupPerson(person)
    }
  })
})

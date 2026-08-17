import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import {
  sessionUserOwnsEmployee,
  sessionUserOwnsPerson,
} from '#helpers/session_user_owns_employee'

test.group('sessionUserOwnsEmployee', (group) => {
  let businessUnitId: number
  let user: User
  let employee: { employeeId: number }
  let otherEmployee: { employeeId: number }
  let deletedEmployee: { employeeId: number }
  const createdPersonIds: number[] = []
  const createdEmployeeIds: number[] = []
  const createdDepartmentIds: number[] = []
  const createdPositionIds: number[] = []

  group.setup(async () => {
    const bu = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_active', 1)
      .firstOrFail()
    businessUnitId = bu.businessUnitId

    const person = await createPerson('owner')
    user = new User()
    user.personId = person.personId
    employee = { employeeId: await createEmployeeFor(person.personId, 'owner') }
    const otherPerson = await createPerson('other')
    otherEmployee = { employeeId: await createEmployeeFor(otherPerson.personId, 'other') }
    deletedEmployee = {
      employeeId: await createEmployeeFor(person.personId, 'deleted', { softDeleted: true }),
    }
  })

  group.teardown(async () => {
    if (createdEmployeeIds.length) {
      await db.from('employees').whereIn('employee_id', createdEmployeeIds).delete()
    }
    if (createdPositionIds.length) {
      await db.from('positions').whereIn('position_id', createdPositionIds).delete()
    }
    if (createdDepartmentIds.length) {
      await db.from('departments').whereIn('department_id', createdDepartmentIds).delete()
    }
    if (createdPersonIds.length) {
      await Person.query().whereIn('person_id', createdPersonIds).delete()
    }
  })

  async function createPerson(prefix: string) {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const person = await Person.create({
      personFirstname: 'Helper',
      personLastname: 'OwnsEmployee',
      personSecondLastname: prefix,
      personEmail: `session-owns-${prefix}-${stamp}@gsti-tests.local`,
    })
    createdPersonIds.push(person.personId)
    return person
  }

  async function createEmployeeFor(
    personId: number,
    prefix: string,
    opts?: { softDeleted?: boolean }
  ) {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const now = new Date()
    const departmentInsert = await db.table('departments').insert({
      department_sync_id: stamp,
      department_code: `DEP-SUE-${stamp}`,
      department_name: `Dep ${prefix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      department_active: 1,
      department_created_at: now,
    })
    const departmentId = Number(departmentInsert[0])
    createdDepartmentIds.push(departmentId)
    const positionInsert = await db.table('positions').insert({
      position_sync_id: stamp,
      position_code: `POS-SUE-${stamp}`,
      position_name: `Pos ${prefix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      position_active: 1,
      position_created_at: now,
    })
    const positionId = Number(positionInsert[0])
    createdPositionIds.push(positionId)
    const employeeInsert = await db.table('employees').insert({
      employee_sync_id: `EMP-SUE-${stamp}`,
      employee_code: `EMP-SUE-${stamp}`,
      employee_first_name: 'Helper',
      employee_last_name: 'OwnsEmployee',
      employee_second_last_name: prefix,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      department_id: departmentId,
      position_id: positionId,
      person_id: personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: `emp-sue-${prefix}-${stamp}@gsti-tests.local`,
      employee_terminated_date: null,
      employee_deleted_at: opts?.softDeleted ? now : null,
      employee_created_at: now,
    })
    const employeeId = Number(employeeInsert[0])
    createdEmployeeIds.push(employeeId)
    return employeeId
  }

  test('true cuando employees.person_id coincide con users.person_id', async ({ assert }) => {
    assert.isTrue(await sessionUserOwnsEmployee(user, employee.employeeId))
  })

  test('false cuando el employeeId es de otro colaborador', async ({ assert }) => {
    assert.isFalse(await sessionUserOwnsEmployee(user, otherEmployee.employeeId))
  })

  test('false cuando el colaborador está soft-deleted', async ({ assert }) => {
    assert.isFalse(await sessionUserOwnsEmployee(user, deletedEmployee.employeeId))
  })

  test('false sin usuario o sin personId', async ({ assert }) => {
    assert.isFalse(await sessionUserOwnsEmployee(null, employee.employeeId))
    const orphan = new User()
    orphan.personId = undefined as unknown as number
    assert.isFalse(await sessionUserOwnsEmployee(orphan, employee.employeeId))
  })

  test('sessionUserOwnsPerson compara personId de sesión', ({ assert }) => {
    assert.isTrue(sessionUserOwnsPerson(user, user.personId))
    assert.isFalse(sessionUserOwnsPerson(user, user.personId + 999999))
    assert.isFalse(sessionUserOwnsPerson(null, 1))
  })
})

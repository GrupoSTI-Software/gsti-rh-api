import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import { personIsCollaborator } from '#helpers/person_is_collaborator'

test.group('personIsCollaborator', (group) => {
  let businessUnitId: number
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
      personLastname: 'Collaborator',
      personSecondLastname: prefix,
      personEmail: `person-collab-${prefix}-${stamp}@gsti-tests.local`,
    })
    createdPersonIds.push(person.personId)
    return person
  }

  async function createEmployeeFor(personId: number, prefix: string, opts?: { terminated?: boolean; softDeleted?: boolean }) {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const now = new Date()
    const departmentInsert = await db.table('departments').insert({
      department_sync_id: stamp,
      department_code: `DEP-PIC-${stamp}`,
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
      position_code: `POS-PIC-${stamp}`,
      position_name: `Pos ${prefix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      position_active: 1,
      position_created_at: now,
    })
    const positionId = Number(positionInsert[0])
    createdPositionIds.push(positionId)
    const employeeInsert = await db.table('employees').insert({
      employee_sync_id: `EMP-PIC-${stamp}`,
      employee_code: `EMP-PIC-${stamp}`,
      employee_first_name: 'Helper',
      employee_last_name: 'Collaborator',
      employee_second_last_name: prefix,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      department_id: departmentId,
      position_id: positionId,
      person_id: personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: `emp-pic-${prefix}-${stamp}@gsti-tests.local`,
      employee_terminated_date: opts?.terminated ? '2024-01-15' : null,
      employee_deleted_at: opts?.softDeleted ? now : null,
      employee_created_at: now,
    })
    const employeeId = Number(employeeInsert[0])
    createdEmployeeIds.push(employeeId)
    return employeeId
  }

  test('retorna true si hay colaborador no eliminado', async ({ assert }) => {
    const person = await createPerson('active')
    await createEmployeeFor(person.personId, 'active')
    assert.isTrue(await personIsCollaborator(person.personId))
  })

  test('retorna true si el colaborador tiene baja operativa pero no soft-delete (decisión interim)', async ({
    assert,
  }) => {
    const person = await createPerson('term')
    await createEmployeeFor(person.personId, 'term', { terminated: true })
    assert.isTrue(await personIsCollaborator(person.personId))
  })

  test('retorna false si el colaborador está soft-deleted', async ({ assert }) => {
    const person = await createPerson('soft')
    await createEmployeeFor(person.personId, 'soft', { softDeleted: true })
    assert.isFalse(await personIsCollaborator(person.personId))
  })

  test('retorna false si no hay vínculo con colaborador', async ({ assert }) => {
    const person = await createPerson('orphan')
    assert.isFalse(await personIsCollaborator(person.personId))
  })
})

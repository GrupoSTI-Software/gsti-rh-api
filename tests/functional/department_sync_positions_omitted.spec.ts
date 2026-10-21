/**
 * La sincronización omite el puesto que ya pertenece a otro departamento
 * (VLRH-H1792122315616, CA-11 y CA-12).
 */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
  createPositionFixture,
  linkDepartmentPositionFixture,
} from '#tests/helpers/org_chart_fixtures'
import { createEmployeeFixture, type EmployeeFixture } from '#tests/helpers/employee_fixture'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

const SYNCED_MESSAGE = 'Los puestos por departamento han sido sincronizados exitosamente'
const OMITTED_MESSAGE =
  'Los puestos se sincronizaron, pero se omitieron 1 que ya pertenecen a otro departamento o no corresponden a la empresa.'

test.group('department sync-positions — puestos omitidos (VLRH-H1792122315616)', (group) => {
  let actor: TenantActor | null = null
  const fixtures: EmployeeFixture[] = []

  group.setup(async () => {
    actor = await createBypassActor('root', 'dp-sync')
  })

  group.teardown(async () => {
    const buId = required(actor, 'actor').businessUnit.businessUnitId
    for (const fixture of fixtures) {
      await db.from('employees').where('employee_id', fixture.employee.employeeId).delete()
      await Person.query().where('person_id', fixture.person.personId).delete()
    }
    await cleanupOrgChartFixtures(buId)
    await cleanupTenantActor(actor)
  })

  test('CA-11 — omite el puesto ligado a otro departamento y liga el libre', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const department = await createDepartmentFixture(buId, 'sync-depto')
    const other = await createDepartmentFixture(buId, 'sync-otro')
    const free = await createPositionFixture(buId, 'sync-libre')
    const same = await createPositionFixture(buId, 'sync-mismo')
    const taken = await createPositionFixture(buId, 'sync-ajeno')
    await linkDepartmentPositionFixture(department.departmentId, same.positionId, buId)
    await linkDepartmentPositionFixture(other.departmentId, taken.positionId, buId)

    const freeEmployee = await createEmployeeFixture(buId, 'sync-libre')
    const sameEmployee = await createEmployeeFixture(buId, 'sync-mismo')
    const takenEmployee = await createEmployeeFixture(buId, 'sync-ajeno')
    fixtures.push(freeEmployee, sameEmployee, takenEmployee)

    await db.from('employees').where('employee_id', freeEmployee.employee.employeeId).update({
      department_id: department.departmentId,
      position_id: free.positionId,
    })
    await db.from('employees').where('employee_id', sameEmployee.employee.employeeId).update({
      department_id: department.departmentId,
      position_id: same.positionId,
    })
    await db.from('employees').where('employee_id', takenEmployee.employee.employeeId).update({
      department_id: department.departmentId,
      position_id: taken.positionId,
    })

    const beforeSame = await db
      .from('department_position')
      .where('position_id', same.positionId)
      .whereNull('department_position_deleted_at')

    const res = await client
      .post('/api/departments/sync-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: department.departmentId })

    assert.equal(res.status(), 200, JSON.stringify(res.body()))
    assert.equal(res.body().message, OMITTED_MESSAGE)
    assert.deepEqual(res.body().data.omittedPositions, [
      { positionId: taken.positionId, reason: 'puesto-ligado-a-otro-departamento' },
    ])

    const freeLinks = await db
      .from('department_position')
      .where('position_id', free.positionId)
      .where('department_id', department.departmentId)
      .whereNull('department_position_deleted_at')
    assert.lengthOf(freeLinks, 1)

    const sameLinks = await db
      .from('department_position')
      .where('position_id', same.positionId)
      .whereNull('department_position_deleted_at')
    assert.lengthOf(sameLinks, beforeSame.length)

    const takenLinks = await db
      .from('department_position')
      .where('position_id', taken.positionId)
      .where('department_id', department.departmentId)
      .whereNull('department_position_deleted_at')
    assert.lengthOf(takenLinks, 0)
  })

  test('CA-12 — repetir no duplica y, sin omitidos, el mensaje es el de siempre', async ({
    client,
    assert,
  }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const department = await createDepartmentFixture(buId, 'sync-idem')
    const other = await createDepartmentFixture(buId, 'sync-idem-otro')
    const free = await createPositionFixture(buId, 'sync-idem-libre')
    const taken = await createPositionFixture(buId, 'sync-idem-ajeno')
    await linkDepartmentPositionFixture(other.departmentId, taken.positionId, buId)

    const freeEmployee = await createEmployeeFixture(buId, 'sync-idem-libre')
    const takenEmployee = await createEmployeeFixture(buId, 'sync-idem-ajeno')
    fixtures.push(freeEmployee, takenEmployee)
    await db.from('employees').where('employee_id', freeEmployee.employee.employeeId).update({
      department_id: department.departmentId,
      position_id: free.positionId,
    })
    await db.from('employees').where('employee_id', takenEmployee.employee.employeeId).update({
      department_id: department.departmentId,
      position_id: taken.positionId,
    })

    const first = await client
      .post('/api/departments/sync-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: department.departmentId })
    assert.equal(first.status(), 200, JSON.stringify(first.body()))

    const afterFirst = await db
      .from('department_position')
      .where('position_id', free.positionId)
      .whereNull('department_position_deleted_at')

    const second = await client
      .post('/api/departments/sync-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: department.departmentId })

    assert.equal(second.status(), 200, JSON.stringify(second.body()))
    assert.deepEqual(second.body().data.omittedPositions, [
      { positionId: taken.positionId, reason: 'puesto-ligado-a-otro-departamento' },
    ])
    const afterSecond = await db
      .from('department_position')
      .where('position_id', free.positionId)
      .whereNull('department_position_deleted_at')
    assert.lengthOf(afterSecond, afterFirst.length)

    const cleanDepartment = await createDepartmentFixture(buId, 'sync-limpio')
    const cleanPosition = await createPositionFixture(buId, 'sync-limpio')
    const cleanEmployee = await createEmployeeFixture(buId, 'sync-limpio')
    fixtures.push(cleanEmployee)
    await db.from('employees').where('employee_id', cleanEmployee.employee.employeeId).update({
      department_id: cleanDepartment.departmentId,
      position_id: cleanPosition.positionId,
    })

    const clean = await client
      .post('/api/departments/sync-positions')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ departmentId: cleanDepartment.departmentId })

    assert.equal(clean.status(), 200, JSON.stringify(clean.body()))
    assert.equal(clean.body().message, SYNCED_MESSAGE)
    assert.deepEqual(clean.body().data.omittedPositions, [])
  })
})

/**
 * CA1–CA4 — aislamiento de la estructura demo (USRH1789328927671).
 * No llama run(): eso purga tablas de toda la base.
 */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Department from '#models/department'
import Position from '#models/position'
import DepartmentPosition from '#models/department_position'
import {
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import DemoFactoryService, {
  requireDemoSupportStructure,
  type DemoFactoryResult,
  type DemoStructureMaps,
} from '#modules/demo/services/demo_factory_service'
import { DEMO_SUPPORT_DEPARTMENT_KEY } from '#modules/demo/factories/department_factory'
import { DEMO_SUPPORT_POSITION_KEY } from '#modules/demo/factories/position_factory'

const FILLER_NAMES = ['Sin Departamento', 'Sin posición']

function emptyResult(): DemoFactoryResult {
  return {
    departments: { created: 0, total: 0 },
    positions: { created: 0, total: 0 },
    shifts: { created: 0, total: 0 },
    employees: { created: 0, total: 0 },
    users: { created: 0, total: 0 },
    employeeExtras: {
      addresses: 0,
      emergencyContacts: 0,
      records: 0,
      branchOfficeAssignments: 0,
      vacations: 0,
      permits: 0,
      vacationArchives: 0,
      exceptionRequests: 0,
    },
    assists: { employees: 0, pairs: 0 },
  }
}

async function countLive(table: 'departments' | 'positions', businessUnitId: number): Promise<number> {
  const deletedColumn = table === 'departments' ? 'department_deleted_at' : 'position_deleted_at'
  const rows = await db.from(table).where('business_unit_id', businessUnitId).whereNull(deletedColumn)
  return rows.length
}

async function wipeStructure(businessUnitId: number): Promise<void> {
  await db.from('departments').where('business_unit_id', businessUnitId).update({ parent_department_id: null })
  await db.from('positions').where('business_unit_id', businessUnitId).update({ parent_position_id: null })
  await db.from('department_position').where('business_unit_id', businessUnitId).delete()
  await db.from('positions').where('business_unit_id', businessUnitId).delete()
  await db.from('departments').where('business_unit_id', businessUnitId).delete()
}

test.group('demo_structure_tenant_isolation — USRH1789328927671', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let deptB: Department | null = null
  let posB: Position | null = null

  group.setup(async () => {
    actorA = await createBypassActor('root', 'DemoStructA')
    actorB = await createBypassActor('root', 'DemoStructB')
    const b = required(actorB, 'actorB')

    deptB = await Department.create({
      departmentSyncId: Date.now(),
      departmentCode: `RH-B-${Date.now()}`.slice(0, 50),
      departmentName: 'Recursos Humanos de B',
      departmentAlias: 'Recursos Humanos',
      departmentIsDefault: false,
      departmentActive: 1,
      businessUnitId: b.businessUnit.businessUnitId,
      companyId: b.businessUnit.businessUnitId,
      parentDepartmentSyncId: 0,
    })

    posB = await Position.create({
      positionSyncId: Date.now(),
      positionCode: `REC-B-${Date.now()}`.slice(0, 50),
      positionName: 'Reclutador de B',
      positionAlias: 'Reclutador',
      positionIsDefault: false,
      positionActive: 1,
      businessUnitId: b.businessUnit.businessUnitId,
      companyId: b.businessUnit.businessUnitId,
      parentPositionSyncId: 0,
    })
  })

  group.teardown(async () => {
    if (actorA) await wipeStructure(actorA.businessUnit.businessUnitId)
    if (actorB) await wipeStructure(actorB.businessUnit.businessUnitId)
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
    actorA = null
    actorB = null
    deptB = null
    posB = null
  })

  test('CA1 — seedStructure crea 13 departamentos y 25 puestos de la empresa A, sin relleno', async ({
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const buIdA = a.businessUnit.businessUnitId
    const result = emptyResult()

    const maps = await new DemoFactoryService().seedStructure(buIdA, result)

    assert.equal(Object.keys(maps.departmentsMap).length, 13)
    assert.equal(Object.keys(maps.positionsMap).length, 25)
    assert.equal(result.departments.created, 13)
    assert.equal(result.positions.created, 25)

    for (const department of Object.values(maps.departmentsMap)) {
      assert.equal(department.businessUnitId, buIdA)
      assert.notEqual(department.departmentId, 999)
      assert.isFalse(FILLER_NAMES.some((name) => department.departmentName.includes(name)))
      assert.isFalse(FILLER_NAMES.some((name) => (department.departmentAlias ?? '').includes(name)))
    }
    for (const position of Object.values(maps.positionsMap)) {
      assert.equal(position.businessUnitId, buIdA)
      assert.notEqual(position.positionId, 999)
      assert.isFalse(FILLER_NAMES.some((name) => position.positionName.includes(name)))
      assert.isFalse(FILLER_NAMES.some((name) => (position.positionAlias ?? '').includes(name)))
    }
  })

  test('CA1 — el departamento y el puesto homónimos de B quedan intactos y no se reutilizan', async ({
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const b = required(actorB, 'actorB')
    const departmentB = required(deptB, 'deptB')
    const positionB = required(posB, 'posB')
    const maps = await new DemoFactoryService().seedStructure(
      a.businessUnit.businessUnitId,
      emptyResult()
    )

    assert.notEqual(maps.departmentsMap['Recursos Humanos'].departmentId, departmentB.departmentId)
    assert.notEqual(maps.positionsMap['Reclutador'].positionId, positionB.positionId)

    const departmentBAfter = await Department.findOrFail(departmentB.departmentId)
    const positionBAfter = await Position.findOrFail(positionB.positionId)
    assert.equal(departmentBAfter.departmentName, 'Recursos Humanos de B')
    assert.equal(departmentBAfter.departmentAlias, 'Recursos Humanos')
    assert.equal(departmentBAfter.businessUnitId, b.businessUnit.businessUnitId)
    assert.equal(positionBAfter.positionName, 'Reclutador de B')
    assert.equal(positionBAfter.positionAlias, 'Reclutador')
    assert.equal(positionBAfter.businessUnitId, b.businessUnit.businessUnitId)
  })

  test('CA2 — la segunda corrida no duplica y deja 25 relaciones de A', async ({ assert }) => {
    const a = required(actorA, 'actorA')
    const buIdA = a.businessUnit.businessUnitId
    const service = new DemoFactoryService()

    await service.seedStructure(buIdA, emptyResult())
    const departmentsBefore = await countLive('departments', buIdA)
    const positionsBefore = await countLive('positions', buIdA)

    const second = emptyResult()
    const maps = await service.seedStructure(buIdA, second)

    assert.equal(second.departments.created, 0)
    assert.equal(second.positions.created, 0)
    assert.equal(second.departments.total, 13)
    assert.equal(second.positions.total, 25)
    assert.equal(await countLive('departments', buIdA), departmentsBefore)
    assert.equal(await countLive('positions', buIdA), positionsBefore)

    const positionIds = Object.values(maps.positionsMap).map((position) => position.positionId)
    const relations = await DepartmentPosition.query()
      .whereIn('position_id', positionIds)
      .whereNull('department_position_deleted_at')

    assert.lengthOf(relations, 25)
    for (const relation of relations) {
      assert.equal(relation.businessUnitId, buIdA)
    }
  })

  test('CA3 — requireDemoSupportStructure devuelve el par de A con su relación', async ({
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const buIdA = a.businessUnit.businessUnitId
    const maps = await new DemoFactoryService().seedStructure(buIdA, emptyResult())
    const { department, position } = requireDemoSupportStructure(maps)

    assert.equal(department.departmentAlias, DEMO_SUPPORT_DEPARTMENT_KEY)
    assert.equal(position.positionAlias, DEMO_SUPPORT_POSITION_KEY)
    assert.equal(department.businessUnitId, buIdA)
    assert.equal(position.businessUnitId, buIdA)

    const relation = await DepartmentPosition.query()
      .where('department_id', department.departmentId)
      .where('position_id', position.positionId)
      .whereNull('department_position_deleted_at')
      .first()

    assert.exists(relation)
    assert.equal(relation!.businessUnitId, buIdA)
  })

  test('CA4 — mapas sin soporte lanzan Error [demo_factory_service] sin datos personales ni SQL', ({
    assert,
  }) => {
    const empty: DemoStructureMaps = { departmentsMap: {}, positionsMap: {} }
    try {
      requireDemoSupportStructure(empty)
      assert.fail('debía lanzar')
    } catch (error) {
      assert.instanceOf(error, Error)
      const message = error instanceof Error ? error.message : String(error)
      assert.isTrue(message.startsWith('[demo_factory_service]'))
      assert.include(message, DEMO_SUPPORT_DEPARTMENT_KEY)
      assert.notInclude(message, '@')
      assert.notMatch(message, /select|insert|update|delete|from\s+`/i)
    }

    const onlyDepartment = {
      departmentsMap: {
        [DEMO_SUPPORT_DEPARTMENT_KEY]: { departmentId: 1 } as Department,
      },
      positionsMap: {},
    }
    try {
      requireDemoSupportStructure(onlyDepartment)
      assert.fail('debía lanzar por el puesto')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      assert.isTrue(message.startsWith('[demo_factory_service]'))
      assert.include(message, DEMO_SUPPORT_POSITION_KEY)
      assert.notInclude(message, '@')
    }
  })
})

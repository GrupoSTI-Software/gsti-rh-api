/**
 * Mover un puesto arrastra a sus ocupantes vigentes
 * (VLRH-H1792361811406, CA-1 a CA-12).
 */
import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Position from '#models/position'
import OrgChartMoveService from '#services/org_chart_move_service'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
  createPositionFixture,
  linkDepartmentPositionFixture,
} from '#tests/helpers/org_chart_fixtures'
import { lockHolderOf, waitForLockWaitOn } from '#tests/helpers/lock_wait'
import {
  assertModuleEnforced,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import { TenantContext } from '#utils/tenant_context'

const employeeIds: number[] = []
const personIds: number[] = []

async function createTestEmployee(opts: {
  businessUnitId: number
  departmentId: number | null
  positionId: number | null
  deleted?: boolean
}): Promise<number> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Ocupante',
    personLastname: 'Prueba',
    personSecondLastname: stamp.slice(0, 20),
    personEmail: `ocupante-${stamp}@spec.local`,
    businessUnitId: opts.businessUnitId,
  })
  personIds.push(person.personId)
  const inserted = await db.table('employees').insert({
    person_id: person.personId,
    employee_slug: randomUUID(),
    employee_sync_id: `TST-${stamp}`.slice(0, 50),
    employee_code: `TST-${stamp}`.slice(0, 20),
    employee_first_name: 'Test',
    employee_last_name: `Emp${stamp}`.slice(0, 30),
    employee_second_last_name: '',
    company_id: opts.businessUnitId,
    business_unit_id: opts.businessUnitId,
    payroll_business_unit_id: opts.businessUnitId,
    department_id: opts.departmentId,
    position_id: opts.positionId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `tst-${stamp}@spec.local`.slice(0, 60),
    employee_deleted_at: opts.deleted ? now : null,
    employee_created_at: now,
    employee_updated_at: now,
  })
  const id = Number(Array.isArray(inserted) ? inserted[0] : inserted)
  employeeIds.push(id)
  return id
}

async function employeeOf(employeeId: number) {
  return db.from('employees').where('employee_id', employeeId).first()
}

async function livePivot(positionId: number) {
  return db
    .from('department_position')
    .where('position_id', positionId)
    .whereNull('department_position_deleted_at')
    .first()
}

async function buildTree(businessUnitId: number) {
  const production = await createDepartmentFixture(businessUnitId, 'Produccion')
  const services = await createDepartmentFixture(businessUnitId, 'Servicios Generales')
  const jefe = await createPositionFixture(businessUnitId, 'Jefe de mantenimiento')
  const tecnico = await createPositionFixture(businessUnitId, 'Tecnico')
  const auxiliar = await createPositionFixture(businessUnitId, 'Auxiliar')
  await db.from('positions').where('position_id', tecnico.positionId).update({
    parent_position_id: jefe.positionId,
  })
  await db.from('positions').where('position_id', auxiliar.positionId).update({
    parent_position_id: jefe.positionId,
  })
  await linkDepartmentPositionFixture(production.departmentId, jefe.positionId, businessUnitId)
  await linkDepartmentPositionFixture(production.departmentId, tecnico.positionId, businessUnitId)
  await linkDepartmentPositionFixture(production.departmentId, auxiliar.positionId, businessUnitId)
  return { production, services, jefe, tecnico, auxiliar }
}

function positionPayload(position: Position, extra: Record<string, unknown> = {}) {
  return {
    positionCode: position.positionCode,
    positionName: position.positionName,
    positionActive: true,
    ...extra,
  }
}

class FailingMoveService extends OrgChartMoveService {
  protected override async relocateOccupants(
    _trx: TransactionClientContract,
    _params: { linkedIds: number[]; businessUnitId: number; departmentId: number }
  ): Promise<number> {
    throw new Error('falla inyectada')
  }
}

test.group('organigrama — mover un puesto arrastra ocupantes (VLRH-H1792361811406)', (group) => {
  let actor: TenantActor | null = null
  let actorB: TenantActor | null = null

  group.setup(async () => {
    actor = await createBypassActor('root', 'relocate-a')
    actorB = await createBypassActor('root', 'relocate-b')
  })

  group.teardown(async () => {
    const buA = required(actor, 'actor').businessUnit.businessUnitId
    const buB = required(actorB, 'actorB').businessUnit.businessUnitId
    if (employeeIds.length > 0) {
      await db.from('employees').whereIn('employee_id', employeeIds).delete()
    }
    if (personIds.length > 0) {
      await db.from('people').whereIn('person_id', personIds).delete()
    }
    await db.from('positions').whereIn('business_unit_id', [buA, buB]).update({ parent_position_id: null })
    await cleanupOrgChartFixtures(buA)
    await cleanupOrgChartFixtures(buB)
    await cleanupTenantActor(actor)
    await cleanupTenantActor(actorB)
  })

  test('CA-1 — el organigrama mueve el puesto y a sus ocupantes', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    const e1 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.jefe.positionId,
    })
    const e2 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.tecnico.positionId,
    })
    const e3 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.auxiliar.positionId,
    })

    const res = await client
      .patch(`/api/positions/${tree.jefe.positionId}/move`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ parentPositionId: null, departmentId: tree.services.departmentId })

    assert.equal(res.status(), 200, JSON.stringify(res.body()))
    assert.equal(res.body().data.employeesRelocated, 3)
    assert.exists(res.body().data.position)
    for (const positionId of [tree.jefe.positionId, tree.tecnico.positionId, tree.auxiliar.positionId]) {
      const pivot = await livePivot(positionId)
      assert.equal(Number(pivot.department_id), tree.services.departmentId)
    }
    for (const [employeeId, positionId] of [
      [e1, tree.jefe.positionId],
      [e2, tree.tecnico.positionId],
      [e3, tree.auxiliar.positionId],
    ] as const) {
      const row = await employeeOf(employeeId)
      assert.equal(Number(row.department_id), tree.services.departmentId)
      assert.equal(Number(row.position_id), positionId)
    }
  })

  test('CA-2 — editar el puesto mueve a su ocupante', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    const e1 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.jefe.positionId,
    })

    const res = await client
      .put(`/api/positions/${tree.jefe.positionId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json(positionPayload(tree.jefe, { departmentId: tree.services.departmentId }))

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    assert.equal(res.body().type, 'success')
    assert.equal(res.body().data.employeesRelocated, 1)
    assert.exists(res.body().data.position)
    const row = await employeeOf(e1)
    assert.equal(Number(row.department_id), tree.services.departmentId)
    assert.equal(Number(row.position_id), tree.jefe.positionId)
  })

  test('CA-3 — cambiar solo el nombre no mueve empleados', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    const e1 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.jefe.positionId,
    })

    const res = await client
      .put(`/api/positions/${tree.jefe.positionId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json(positionPayload(tree.jefe, { positionName: `${tree.jefe.positionName} editado`.slice(0, 100) }))

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    assert.equal(res.body().data.employeesRelocated, 0)
    const row = await employeeOf(e1)
    assert.equal(Number(row.department_id), tree.production.departmentId)
  })

  test('CA-4 — reacomodar sin cambiar de departamento cuenta cero', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    const coordinador = await createPositionFixture(buId, 'Coordinador')
    await linkDepartmentPositionFixture(tree.production.departmentId, coordinador.positionId, buId)
    const e2 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.tecnico.positionId,
    })

    const res = await client
      .patch(`/api/positions/${tree.tecnico.positionId}/move`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ parentPositionId: coordinador.positionId, departmentId: tree.production.departmentId })

    assert.equal(res.status(), 200, JSON.stringify(res.body()))
    assert.equal(res.body().data.employeesRelocated, 0)
    const row = await employeeOf(e2)
    assert.equal(Number(row.department_id), tree.production.departmentId)
  })

  test('CA-5 — un ocupante sin departamento queda en el destino y cuenta', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    const e4 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: null,
      positionId: tree.tecnico.positionId,
    })

    const res = await client
      .patch(`/api/positions/${tree.jefe.positionId}/move`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ parentPositionId: null, departmentId: tree.services.departmentId })

    assert.equal(res.status(), 200, JSON.stringify(res.body()))
    assert.equal(res.body().data.employeesRelocated, 1)
    const row = await employeeOf(e4)
    assert.equal(Number(row.department_id), tree.services.departmentId)
  })

  test('CA-6 — un empleado dado de baja conserva su departamento', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    const e5 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.tecnico.positionId,
      deleted: true,
    })

    const res = await client
      .patch(`/api/positions/${tree.jefe.positionId}/move`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ parentPositionId: null, departmentId: tree.services.departmentId })

    assert.equal(res.status(), 200, JSON.stringify(res.body()))
    assert.equal(res.body().data.employeesRelocated, 0)
    const row = await employeeOf(e5)
    assert.equal(Number(row.department_id), tree.production.departmentId)
  })

  test('CA-7 — un puesto del grupo sin vínculo no mueve a su ocupante', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    await db.from('department_position').where('position_id', tree.auxiliar.positionId).update({
      department_position_deleted_at: new Date(),
    })
    const e3 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.auxiliar.positionId,
    })

    const res = await client
      .patch(`/api/positions/${tree.jefe.positionId}/move`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ parentPositionId: null, departmentId: tree.services.departmentId })

    assert.equal(res.status(), 200, JSON.stringify(res.body()))
    assert.equal(res.body().data.employeesRelocated, 0)
    assert.isNull(await livePivot(tree.auxiliar.positionId))
    const row = await employeeOf(e3)
    assert.equal(Number(row.department_id), tree.production.departmentId)
  })

  test('CA-8 — no mueve puestos ni empleados de otra empresa', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const b = required(actorB, 'actorB')
    const buA = a.businessUnit.businessUnitId
    const buB = b.businessUnit.businessUnitId
    const tree = await buildTree(buA)
    const foreignDepartment = await createDepartmentFixture(buB, 'Departamento B')
    const foreignPosition = await createPositionFixture(buB, 'Puesto B')
    await db.from('positions').where('position_id', foreignPosition.positionId).update({
      parent_position_id: tree.jefe.positionId,
    })
    await linkDepartmentPositionFixture(
      foreignDepartment.departmentId,
      foreignPosition.positionId,
      buB
    )
    const occupantB = await createTestEmployee({
      businessUnitId: buB,
      departmentId: foreignDepartment.departmentId,
      positionId: foreignPosition.positionId,
    })
    const crossed = await createTestEmployee({
      businessUnitId: buB,
      departmentId: foreignDepartment.departmentId,
      positionId: tree.jefe.positionId,
    })

    const res = await client
      .patch(`/api/positions/${tree.jefe.positionId}/move`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ parentPositionId: null, departmentId: tree.services.departmentId })

    assert.equal(res.status(), 200, JSON.stringify(res.body()))
    assert.equal(res.body().data.employeesRelocated, 0)
    const serialized = JSON.stringify(res.body())
    assert.notInclude(serialized, foreignDepartment.departmentName)
    assert.notInclude(serialized, foreignPosition.positionName)
    const foreignPivot = await livePivot(foreignPosition.positionId)
    const occupantRow = await employeeOf(occupantB)
    const crossedRow = await employeeOf(crossed)
    assert.equal(Number(foreignPivot.department_id), foreignDepartment.departmentId)
    assert.equal(Number(occupantRow.department_id), foreignDepartment.departmentId)
    assert.equal(Number(crossedRow.department_id), foreignDepartment.departmentId)
  })

  test('CA-9 — si falla el arrastre no se mueve nada', async ({ assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    const e1 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.jefe.positionId,
    })
    const e2 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.tecnico.positionId,
    })
    const e3 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.auxiliar.positionId,
    })
    const parentBefore = tree.jefe.parentPositionId

    try {
      await TenantContext.run([buId], async () => {
        await new FailingMoveService({ formatMessage: (key: string) => key } as unknown as I18n).relocatePosition(
          tree.jefe.positionId,
          null,
          tree.services.departmentId
        )
      })
      assert.fail('el movimiento debía fallar')
    } catch (error) {
      assert.equal(error instanceof Error ? error.message : String(error), 'falla inyectada')
    }

    const jefe = await db.from('positions').where('position_id', tree.jefe.positionId).first()
    assert.equal(jefe.parent_position_id, parentBefore)
    for (const positionId of [tree.jefe.positionId, tree.tecnico.positionId, tree.auxiliar.positionId]) {
      const pivot = await livePivot(positionId)
      assert.equal(Number(pivot.department_id), tree.production.departmentId)
    }
    for (const employeeId of [e1, e2, e3]) {
      const row = await employeeOf(employeeId)
      assert.equal(Number(row.department_id), tree.production.departmentId)
    }
  })

  test('CA-10 — el movimiento espera el candado del subárbol', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    const e2 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.tecnico.positionId,
    })

    const holderTrx = await db.transaction()
    let pending: Promise<{ status: number; body: unknown }> | null = null
    try {
      const holder = await lockHolderOf(holderTrx)
      await holderTrx.from('positions').where('position_id', tree.tecnico.positionId).forUpdate().first()
      const request = Promise.resolve(
        client
          .patch(`/api/positions/${tree.jefe.positionId}/move`)
          .loginAs(a.user)
          .headers(businessUnitHeaders(a))
          .json({ parentPositionId: null, departmentId: tree.services.departmentId })
      ).then(
        (res) => ({ status: res.status(), body: res.body() as unknown }),
        (error: unknown) => ({ status: 500, body: { error: String(error) } as unknown })
      )
      pending = request
      await waitForLockWaitOn(holder, 'positions', request)
      await holderTrx.commit()
      const outcome = await request
      assert.equal(outcome.status, 200, JSON.stringify(outcome.body))
      const row = await employeeOf(e2)
      assert.equal(Number(row.department_id), tree.services.departmentId)
    } finally {
      if (!holderTrx.isCompleted) await holderTrx.rollback()
      if (pending) await pending
    }
  })

  test('CA-11 — sin vínculo o sin permiso no se mueve a nadie', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const production = await createDepartmentFixture(buId, 'Produccion suelta')
    const services = await createDepartmentFixture(buId, 'Servicios sueltos')
    const jefe = await createPositionFixture(buId, 'Jefe sin vinculo')
    const e1 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: production.departmentId,
      positionId: jefe.positionId,
    })

    const res = await client
      .patch(`/api/positions/${jefe.positionId}/move`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({ parentPositionId: null, departmentId: services.departmentId })

    assert.equal(res.status(), 422, JSON.stringify(res.body()))
    assert.equal(res.body().data.key, 'vinculo-departamento-faltante')
    assert.notProperty(res.body().data, 'employeesRelocated')
    const untouched = await employeeOf(e1)
    assert.equal(Number(untouched.department_id), production.departmentId)

    await assertModuleEnforced('organization-chart')
    const restricted = await createTenantActor('relocate-gate')
    const restrictedBu = restricted.businessUnit.businessUnitId
    try {
      const restrictedDept = await createDepartmentFixture(restrictedBu, 'Depto restringido')
      const restrictedServices = await createDepartmentFixture(restrictedBu, 'Destino restringido')
      const restrictedJob = await createPositionFixture(restrictedBu, 'Puesto restringido')
      await linkDepartmentPositionFixture(
        restrictedDept.departmentId,
        restrictedJob.positionId,
        restrictedBu
      )
      const occupant = await createTestEmployee({
        businessUnitId: restrictedBu,
        departmentId: restrictedDept.departmentId,
        positionId: restrictedJob.positionId,
      })

      const deniedMove = await client
        .patch(`/api/positions/${restrictedJob.positionId}/move`)
        .loginAs(restricted.user)
        .headers(businessUnitHeaders(restricted))
        .json({ parentPositionId: null, departmentId: restrictedServices.departmentId })
      assert.equal(deniedMove.status(), 403, JSON.stringify(deniedMove.body()))

      const deniedUpdate = await client
        .put(`/api/positions/${restrictedJob.positionId}`)
        .loginAs(restricted.user)
        .headers(businessUnitHeaders(restricted))
        .json(
          positionPayload(restrictedJob, { departmentId: restrictedServices.departmentId })
        )
      assertPermissionDenied(assert, deniedUpdate)
      const restrictedOccupant = await employeeOf(occupant)
      assert.equal(Number(restrictedOccupant.department_id), restrictedDept.departmentId)
    } finally {
      await db.from('employees').where('business_unit_id', restrictedBu).delete()
      await db.from('positions').where('business_unit_id', restrictedBu).update({ parent_position_id: null })
      await cleanupOrgChartFixtures(restrictedBu)
      await db
        .from('people')
        .where('business_unit_id', restrictedBu)
        .whereNot('person_id', restricted.person.personId)
        .delete()
      await cleanupTenantActor(restricted)
    }
  })

  test('CA-12 — si el puesto se rechaza no se mueve nadie', async ({ client, assert }) => {
    const a = required(actor, 'actor')
    const buId = a.businessUnit.businessUnitId
    const tree = await buildTree(buId)
    const other = await createPositionFixture(buId, 'Codigo ocupado')
    await db.from('positions').where('position_id', other.positionId).update({ position_code: 'MANT-01' })
    const e1 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.jefe.positionId,
    })
    const e2 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.tecnico.positionId,
    })
    const e3 = await createTestEmployee({
      businessUnitId: buId,
      departmentId: tree.production.departmentId,
      positionId: tree.auxiliar.positionId,
    })

    const duplicated = await client
      .put(`/api/positions/${tree.jefe.positionId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json(
        positionPayload(tree.jefe, {
          positionCode: 'MANT-01',
          departmentId: tree.services.departmentId,
        })
      )

    assert.equal(duplicated.status(), 400, JSON.stringify(duplicated.body()))
    assert.equal(duplicated.body().type, 'warning')
    assert.equal(duplicated.body().title, 'The position code already exists for another position')
    assert.notProperty(duplicated.body().data, 'employeesRelocated')

    const missingParent = await client
      .put(`/api/positions/${tree.jefe.positionId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json(
        positionPayload(tree.jefe, {
          parentPositionId: 9_999_999_999,
          departmentId: tree.services.departmentId,
        })
      )
    assert.equal(missingParent.status(), 400, JSON.stringify(missingParent.body()))
    assert.equal(missingParent.body().title, 'The position parent was not found')

    const jefe = await db.from('positions').where('position_id', tree.jefe.positionId).first()
    assert.equal(jefe.parent_position_id, tree.jefe.parentPositionId)
    assert.equal(jefe.position_code, tree.jefe.positionCode)
    for (const positionId of [tree.jefe.positionId, tree.tecnico.positionId, tree.auxiliar.positionId]) {
      const pivot = await livePivot(positionId)
      assert.equal(Number(pivot.department_id), tree.production.departmentId)
    }
    for (const employeeId of [e1, e2, e3]) {
      const row = await employeeOf(employeeId)
      assert.equal(Number(row.department_id), tree.production.departmentId)
    }
  })
})

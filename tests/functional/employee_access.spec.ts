import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import { ensureRole } from '#tests/helpers/ensure_role'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'

/**
 * Acceso a personal desde la ficha del colaborador: quién puede consultarlo,
 * a quién puede consultar su usuario y la jefatura directa única.
 *
 * Wilvardo (con usuario) consulta a Jesús; Edgar (con usuario) es la jefatura
 * directa de Wilvardo; Karla no tiene usuario.
 */

let actor: TenantActor | null = null
let otherActor: TenantActor | null = null
const fixtures: EmployeeFixture[] = []
const users: User[] = []
let wilvardo: EmployeeFixture
let edgar: EmployeeFixture
let jesus: EmployeeFixture
let karla: EmployeeFixture
let wilvardoUser: User
let edgarUser: User
let jesusUser: User

async function userFor(fixture: EmployeeFixture): Promise<User> {
  const role = await ensureRole('empleado')
  const user = await User.create({
    userEmail: `acceso-${fixture.employee.employeeId}-${Date.now()}@gsti-tests.local`,
    userPassword: 'Test-1234567890',
    userActive: 1,
    roleId: role.roleId,
    personId: fixture.person.personId,
    userEmailType: 'institutional',
  })
  await attachBusinessUnitsWithRole(user, [fixture.businessUnitId], role.roleId)
  users.push(user)
  return user
}

async function grant(userId: number, employeeId: number, directBoss = 0): Promise<number> {
  const [id] = await db.table('user_responsible_employees').insert({
    user_id: userId,
    employee_id: employeeId,
    business_unit_id: wilvardo.businessUnitId,
    user_responsible_employee_readonly: 0,
    user_responsible_employee_direct_boss: directBoss,
    user_responsible_employee_created_at: new Date(),
    user_responsible_employee_updated_at: new Date(),
  })
  return Number(id)
}

function as(
  request: ReturnType<Parameters<Parameters<typeof test>[1]>[0]['client']['get']>,
  who = actor!
) {
  return request
    .loginAs(who.user)
    .header('X-Business-Unit-Id', who.businessUnit.businessUnitPublicId)
}

const base = (fixture: EmployeeFixture) => `/api/v1/employees/${fixture.employee.employeeId}/access`

test.group('Acceso a personal', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'acceso')
    otherActor = await createBypassActor('owner', 'acceso-b')
    const unit = actor.businessUnit.businessUnitId
    wilvardo = await createEmployeeFixture(unit, 'acceso-wilvardo')
    edgar = await createEmployeeFixture(unit, 'acceso-edgar')
    jesus = await createEmployeeFixture(unit, 'acceso-jesus')
    karla = await createEmployeeFixture(unit, 'acceso-karla')
    fixtures.push(wilvardo, edgar, jesus, karla)
    wilvardoUser = await userFor(wilvardo)
    edgarUser = await userFor(edgar)
    jesusUser = await userFor(jesus)

    await grant(edgarUser.userId, wilvardo.employee.employeeId, 1)
    await grant(wilvardoUser.userId, jesus.employee.employeeId)

    return async () => {
      const employeeIds = fixtures.map((fixture) => fixture.employee.employeeId)
      await db.from('user_responsible_employees').whereIn('employee_id', employeeIds).delete()
      for (const user of users) {
        await db.from('business_unit_users').where('user_id', user.userId).delete()
        await db.from('users').where('user_id', user.userId).delete()
      }
      // Los cuatro comparten empresa: primero se van todos los empleados y
      // después el organigrama, que la limpieza de cada fixture borra entero.
      await db.from('employees').whereIn('employee_id', employeeIds).delete()
      for (const fixture of fixtures) await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
      await cleanupTenantActor(otherActor)
    }
  })

  test('lista quién puede consultar al colaborador, con la jefatura directa primero', async ({
    client,
    assert,
  }) => {
    const response = await as(client.get(`${base(wilvardo)}/consulted-by`))
    response.assertStatus(200)
    const items = response.body().data.consultedBy as Array<Record<string, unknown>>
    assert.equal(items[0].userId, edgarUser.userId)
    assert.isTrue(items[0].isDirectBoss)
    assert.isString(items[0].position)
    assert.isString(items[0].department)
  })

  test('lista a quién puede consultar su usuario; sin usuario no puede consultar a nadie', async ({
    client,
    assert,
  }) => {
    const withUser = await as(client.get(`${base(wilvardo)}/can-consult`))
    withUser.assertStatus(200)
    assert.isTrue(withUser.body().data.canConsult.hasUser)
    assert.deepEqual(
      withUser.body().data.canConsult.items.map((item: { employeeId: number }) => item.employeeId),
      [jesus.employee.employeeId]
    )

    const withoutUser = await as(client.get(`${base(karla)}/can-consult`))
    withoutUser.assertStatus(200)
    assert.isFalse(withoutUser.body().data.canConsult.hasUser)

    const add = await as(client.post(`${base(karla)}/can-consult`)).json({
      employeeIds: [jesus.employee.employeeId],
    })
    add.assertStatus(422)
    assert.equal(add.body().key, 'colaborador-sin-usuario')
  })

  test('los candidatos no incluyen al propio colaborador ni a quien ya tiene el acceso', async ({
    client,
    assert,
  }) => {
    const usersResponse = await as(client.get(`${base(wilvardo)}/consulted-by/candidates`))
    usersResponse.assertStatus(200)
    const userIds = usersResponse
      .body()
      .data.candidates.map((candidate: { userId: number }) => candidate.userId)
    assert.notInclude(userIds, wilvardoUser.userId)
    assert.notInclude(userIds, edgarUser.userId)
    assert.include(userIds, jesusUser.userId)

    const employeesResponse = await as(client.get(`${base(wilvardo)}/can-consult/candidates`))
    const employeeIds = employeesResponse
      .body()
      .data.candidates.map((candidate: { employeeId: number }) => candidate.employeeId)
    assert.notInclude(employeeIds, wilvardo.employee.employeeId)
    assert.notInclude(employeeIds, jesus.employee.employeeId)
    assert.include(employeeIds, karla.employee.employeeId)
  })

  test('agrega en lote y descarta lo que ya tenía acceso', async ({ client, assert }) => {
    const added = await as(client.post(`${base(wilvardo)}/can-consult`)).json({
      employeeIds: [karla.employee.employeeId, jesus.employee.employeeId],
    })
    added.assertStatus(201)
    assert.equal(added.body().data.access.created, 1)

    const granted = await as(client.post(`${base(wilvardo)}/consulted-by`)).json({
      userIds: [jesusUser.userId, edgarUser.userId],
    })
    granted.assertStatus(201)
    assert.equal(granted.body().data.access.created, 1)
  })

  test('una sola jefatura directa: avisa quién la tiene y solo la reemplaza al confirmar', async ({
    client,
    assert,
  }) => {
    const jesusAccess = await db
      .from('user_responsible_employees')
      .where('user_id', jesusUser.userId)
      .where('employee_id', wilvardo.employee.employeeId)
      .whereNull('user_responsible_employee_deleted_at')
      .firstOrFail()
    const path = `${base(wilvardo)}/${jesusAccess.user_responsible_employee_id}/direct-boss`

    const conflict = await as(client.put(path)).json({ directBoss: true })
    conflict.assertStatus(409)
    assert.equal(conflict.body().key, 'jefatura-directa-ocupada')
    assert.include(conflict.body().data.currentBossName, 'acceso-edgar')

    const replaced = await as(client.put(path)).json({ directBoss: true, replace: true })
    replaced.assertStatus(200)
    const bosses = await db
      .from('user_responsible_employees')
      .where('employee_id', wilvardo.employee.employeeId)
      .where('user_responsible_employee_direct_boss', 1)
      .whereNull('user_responsible_employee_deleted_at')
    assert.lengthOf(bosses, 1)
    assert.equal(bosses[0].user_id, jesusUser.userId)
    // Edgar pierde la jefatura, no el acceso.
    const edgarAccess = await db
      .from('user_responsible_employees')
      .where('user_id', edgarUser.userId)
      .where('employee_id', wilvardo.employee.employeeId)
      .whereNull('user_responsible_employee_deleted_at')
      .first()
    assert.exists(edgarAccess)
  })

  test('quita un acceso de la ficha; uno ajeno o de otra empresa responde 404', async ({
    client,
    assert,
  }) => {
    const karlaAccess = await db
      .from('user_responsible_employees')
      .where('user_id', wilvardoUser.userId)
      .where('employee_id', karla.employee.employeeId)
      .whereNull('user_responsible_employee_deleted_at')
      .firstOrFail()

    const foreign = await as(
      client.delete(`${base(jesus)}/${karlaAccess.user_responsible_employee_id}`)
    )
    foreign.assertStatus(404)

    const otherTenant = await as(client.get(`${base(wilvardo)}/consulted-by`), otherActor!)
    otherTenant.assertStatus(404)

    const removed = await as(
      client.delete(`${base(wilvardo)}/${karlaAccess.user_responsible_employee_id}`)
    )
    removed.assertStatus(200)
    const row = await db
      .from('user_responsible_employees')
      .where('user_responsible_employee_id', karlaAccess.user_responsible_employee_id)
      .first()
    assert.isNotNull(row.user_responsible_employee_deleted_at)
  })
})

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BusinessUnitUser from '#models/business_unit_user'
import User from '#models/user'
import {
  createBypassActor,
  cleanupTenantActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import {
  createEmployeeFixture,
  cleanupEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'

/**
 * USRH1790276431885 — login y sesión bajo AUTH_OWN_SESSION (CA-02 a CA-06).
 * CA-03 (transferencia de celular) se cubre en `auth_login_device_transfer.spec.ts`
 * con la misma ruta HTTP; aquí se valida el preload de persona/colaborador en app.
 */

const TEST_PASSWORD = 'AuthSessionTenantDefault123!'

const uniqueToken = () => `auth-session-app-${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('Auth — sesión propia con excepción de tenant (USRH1790276431885)', (group) => {
  let actor: TenantActor | null = null
  let employeeFixture: EmployeeFixture | null = null

  group.setup(async () => {
    actor = await createBypassActor('owner', 'auth-session')
    employeeFixture = await createEmployeeFixture(
      actor.businessUnit.businessUnitId,
      'auth-session-emp'
    )
    actor.user.personId = employeeFixture.person.personId
    actor.user.userPassword = TEST_PASSWORD
    actor.user.userPasswordSetAt = DateTime.now()
    await actor.user.save()
  })

  group.teardown(async () => {
    if (actor && employeeFixture) {
      await db.from('employee_devices').where('employee_id', employeeFixture.employee.employeeId).delete()
      await db.from('api_tokens').where('tokenable_id', actor.user.userId).delete()
      // user → persona del empleado; departamentos del fixture → misma empresa del actor.
      await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
      await User.query().where('user_id', actor.user.userId).delete()
      await cleanupEmployeeFixture(employeeFixture)
    }
    await cleanupTenantActor(actor)
    employeeFixture = null
    actor = null
  })

  test('CA-02: login web trae colaborador, puesto y empresa poblados', async ({ client, assert }) => {
    const response = await client.post('/api/auth/login').json({
      userEmail: actor!.user.userEmail,
      userPassword: TEST_PASSWORD,
      deviceOrigin: 'web',
    })

    response.assertStatus(200)
    const user = response.body()?.data?.user
    assert.exists(user?.person?.employee)
    assert.exists(user.person.employee.position)
    assert.exists(user.person.employee.businessUnit)
    assert.equal(user.person.employee.employeeId, employeeFixture!.employee.employeeId)
  })

  test('CA-03: login app con deviceToken registra el celular del colaborador', async ({
    client,
    assert,
  }) => {
    const deviceToken = uniqueToken()
    const response = await client.post('/api/auth/login').json({
      userEmail: actor!.user.userEmail,
      userPassword: TEST_PASSWORD,
      deviceOrigin: 'app',
      deviceToken,
    })

    response.assertStatus(200)
    const device = await db
      .from('employee_devices')
      .where('employee_device_token', deviceToken)
      .first()
    assert.exists(device)
    assert.equal(device!.employee_id, employeeFixture!.employee.employeeId)
  })

  test('CA-04: GET /api/auth/session trae colaborador, puesto, empresa y rol', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/auth/session').loginAs(actor!.user)

    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.person?.employee)
    assert.exists(body.person.employee.position)
    assert.exists(body.person.employee.businessUnit)
    assert.exists(body.role)
  })

  test('CA-06: credenciales incorrectas conservan 404 legacy', async ({ client, assert }) => {
    const response = await client.post('/api/auth/login').json({
      userEmail: actor!.user.userEmail,
      userPassword: 'WrongPassword!999',
      deviceOrigin: 'web',
    })

    response.assertStatus(404)
    assert.equal(response.body()?.message, 'Incorrect email or password')
    assert.equal(response.body()?.title, 'Login')
  })
})

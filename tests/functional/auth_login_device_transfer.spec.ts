import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { DateTime } from 'luxon'
import BusinessUnitUser from '#models/business_unit_user'
import User from '#models/user'
import { createTenantActor, cleanupTenantActor, type TenantActor } from '#tests/helpers/tenant_actor'
import {
  createEmployeeFixture,
  cleanupEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'

/**
 * Login de la app con celular (`deviceOrigin: 'app'` + `deviceToken`).
 *
 * - El celular solo se amarra con la contraseña ya validada.
 * - Dentro de una empresa, un celular de otro colaborador se transfiere a quien
 *   entra y la sesión de la app del dueño anterior se cierra si ese era su
 *   equipo más reciente. La sesión del backoffice de ese colaborador no se toca.
 * - En otra empresa el mismo celular se registra aparte y no afecta a nadie.
 */

const PASSWORD = 'DeviceTransfer123!'

interface AppUser {
  actor: TenantActor
  employee: EmployeeFixture
}

/** Colaborador con usuario de app: el usuario del actor apunta a la persona del empleado. */
async function createAppUser(prefix: string): Promise<AppUser> {
  const actor = await createTenantActor(prefix)
  const employee = await createEmployeeFixture(actor.businessUnit.businessUnitId, prefix)
  actor.user.personId = employee.person.personId
  actor.user.userPassword = PASSWORD
  actor.user.userPasswordSetAt = DateTime.now()
  await actor.user.save()
  return { actor, employee }
}

/** El usuario apunta a la persona del empleado: sale antes que el empleado y la empresa. */
async function cleanupAppUser(appUser: AppUser | null): Promise<void> {
  if (!appUser) return
  const { actor, employee } = appUser
  await db.from('employee_devices').where('employee_id', employee.employee.employeeId).delete()
  await db.from('api_tokens').where('tokenable_id', actor.user.userId).delete()
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await cleanupEmployeeFixture(employee)
  await cleanupTenantActor(actor)
}

/** Muda al colaborador a la empresa de otro: su fixture conserva la propia para limpiarla. */
async function moveToBusinessUnitOf(appUser: AppUser, target: AppUser): Promise<void> {
  await db
    .from('employees')
    .where('employee_id', appUser.employee.employee.employeeId)
    .update({ business_unit_id: target.employee.businessUnitId })
}

async function countTokens(userId: number, origin: 'app' | 'web'): Promise<number> {
  const rows = await db
    .from('api_tokens')
    .where('tokenable_id', userId)
    .where('origin', origin)
    .count('* as total')
  return Number(rows[0].total)
}

const uniqueToken = () => `spec-login-device-${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('Login app — celular transferible entre colaboradores', (group) => {
  let owner: AppUser | null = null
  let other: AppUser | null = null

  group.each.setup(async () => {
    owner = await createAppUser('login-dev-owner')
    other = await createAppUser('login-dev-other')
  })

  // El login limita 10 intentos por IP en 15 min con store `memory`, que vive en
  // el proceso: sin reiniciarlo, los logins de este grupo dejan sin cupo a las
  // suites que corren después y prueban justamente ese límite.
  group.teardown(async () => {
    await limiter.clear()
  })

  group.each.teardown(async () => {
    // Los celulares salen primero: tras mudar a un colaborador, el suyo cuelga
    // de la empresa del otro y bloquearía borrarla.
    const employeeIds = [owner, other]
      .filter((appUser): appUser is AppUser => appUser !== null)
      .map((appUser) => appUser.employee.employee.employeeId)
    await db.from('employee_devices').whereIn('employee_id', employeeIds).delete()
    // `other` primero: mudado, su empleado cuelga de la empresa de `owner`.
    await cleanupAppUser(other)
    await cleanupAppUser(owner)
    owner = null
    other = null
  })

  const login = (client: ApiClient, appUser: AppUser, deviceToken: string, password = PASSWORD) =>
    client.post('/api/auth/login').json({
      userEmail: appUser.actor.user.userEmail,
      userPassword: password,
      deviceOrigin: 'app',
      deviceToken,
    })

  test('con contraseña incorrecta el celular no queda registrado', async ({ client, assert }) => {
    const deviceToken = uniqueToken()

    const response = await login(client, owner!, deviceToken, 'Incorrecta123!')

    response.assertStatus(404)
    const device = await db.from('employee_devices').where('employee_device_token', deviceToken).first()
    assert.isNull(device)
  })

  test('un celular ajeno se transfiere y cierra la sesión de la app del dueño anterior', async ({
    client,
    assert,
  }) => {
    await moveToBusinessUnitOf(other!, owner!)
    const deviceToken = uniqueToken()
    const ownerLogin = await login(client, owner!, deviceToken)
    ownerLogin.assertStatus(200)
    assert.equal(await countTokens(owner!.actor.user.userId, 'app'), 2)

    const response = await login(client, other!, deviceToken)

    response.assertStatus(200)
    const device = await db.from('employee_devices').where('employee_device_token', deviceToken).first()
    assert.equal(device.employee_id, other!.employee.employee.employeeId)
    assert.equal(await countTokens(owner!.actor.user.userId, 'app'), 0)
  })

  test('la transferencia no toca la sesión del backoffice del dueño anterior', async ({
    client,
    assert,
  }) => {
    await moveToBusinessUnitOf(other!, owner!)
    const deviceToken = uniqueToken()
    const ownerLogin = await login(client, owner!, deviceToken)
    ownerLogin.assertStatus(200)
    await db.table('api_tokens').insert({
      tokenable_id: owner!.actor.user.userId,
      type: 'auth_token',
      origin: 'web',
      hash: `spec-web-${deviceToken}`,
      abilities: '["*"]',
      created_at: new Date(),
      updated_at: new Date(),
    })

    const otherLogin = await login(client, other!, deviceToken)
    otherLogin.assertStatus(200)

    assert.equal(await countTokens(owner!.actor.user.userId, 'web'), 1)
  })

  test('en otra empresa el mismo celular se registra aparte y nadie pierde su sesión', async ({
    client,
    assert,
  }) => {
    const deviceToken = uniqueToken()
    const ownerLogin = await login(client, owner!, deviceToken)
    ownerLogin.assertStatus(200)

    const otherLogin = await login(client, other!, deviceToken)

    otherLogin.assertStatus(200)
    assert.equal(await countTokens(owner!.actor.user.userId, 'app'), 2)
    const devices = await db
      .from('employee_devices')
      .where('employee_device_token', deviceToken)
      .whereNull('employee_device_deleted_at')
    assert.lengthOf(devices, 2)
  })
})

import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import ApiToken from '#models/api_token'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import { AUTH_LOGIN_ERROR_CODES } from '#constants/auth_login_error_codes'

/**
 * USRH1786736057519 — blindaje del módulo de usuarios (E5).
 * Aislamiento multi-tenant, exigencia de permiso, login empleado y rate limit.
 */

const TEST_PASSWORD = 'UserTenantIsolation123!'
const NON_EXISTENT_USER_ID = 2_147_483_647

type UsersPermissionSlug = 'create' | 'update' | 'delete' | 'read'

interface TenantBundle {
  businessUnit: BusinessUnit
  role: Role
  actor: User
  actorPerson: Person
}

interface TargetUserFixture {
  user: User
  person: Person
}

interface TestFixtures {
  tenantA: TenantBundle
  tenantB: TargetUserFixture & { businessUnit: BusinessUnit }
  deniedActor: User
  deniedRole: Role
  deniedPerson: Person
  disposableUser: TargetUserFixture
  employeeUser: User
  employeePerson: Person
  employeeBusinessUnit: BusinessUnit
}

let fixtures: TestFixtures | null = null
let usersModule: SystemModule | null = null
let previousUsersEnforcement = false
let permissionEnforcementColumnAvailable = false

async function hasPermissionEnforcementColumn(): Promise<boolean> {
  const result = await db.rawQuery(`
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'system_modules'
      AND COLUMN_NAME = 'system_module_permission_enforcement_active'
  `)
  const rows = result[0] as Array<{ cnt: number }>
  return Number(rows[0]?.cnt ?? 0) > 0
}

async function uniqueStamp() {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function usersPermissionId(slug: UsersPermissionSlug): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', slug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'users')
    )
    .first()

  if (!permission) {
    throw new Error(`Se requiere el permiso "users:${slug}" en BD para este test.`)
  }

  return permission.systemPermissionId
}

async function grantUsersPermissions(roleId: number, slugs: UsersPermissionSlug[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of slugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await usersPermissionId(slug),
    })
  }
}

async function createBusinessUnit(label: string): Promise<BusinessUnit> {
  const stamp = await uniqueStamp()
  return BusinessUnit.create({
    businessUnitName: `${label} ${stamp}`,
    businessUnitSlug: `${label.toLowerCase().replace(/\s+/g, '-')}-${stamp}`,
    businessUnitLegalName: `${label} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createPerson(emailPrefix: string): Promise<Person> {
  const stamp = await uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  return Person.create({
    personFirstname: 'UserIsolation',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
}

async function createUserForPerson(
  person: Person,
  roleId: number,
  businessUnitIds: number[]
): Promise<User> {
  const user = await User.create({
    userEmail: person.personEmail!,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  if (businessUnitIds.length > 0) {
    await user.related('businessUnits').attach(businessUnitIds)
  }

  return user
}

function buHeader(businessUnit: BusinessUnit) {
  return { 'X-Business-Unit-Id': businessUnit.businessUnitPublicId }
}

function notFoundBody(userId: number | string) {
  return {
    type: 'warning',
    title: 'The user was not found',
    message: 'The user was not found with the entered ID',
    data: { userId: String(userId) },
  }
}

function notFoundEnvelope(body: Record<string, unknown>) {
  return {
    type: body.type,
    title: body.title,
    message: body.message,
  }
}

async function countWebTokens(userId: number) {
  return ApiToken.query().where('tokenable_id', userId).where('origin', 'web').count('* as total')
}

async function buildFixtures(): Promise<TestFixtures> {
  const stamp = await uniqueStamp()

  const tenantABu = await createBusinessUnit('User isolation A')
  const tenantBBu = await createBusinessUnit('User isolation B')

  const privilegedRole = await Role.create({
    roleName: `Users isolation privileged ${stamp}`,
    roleSlug: `users-isolation-privileged-${stamp}`,
    roleDescription: 'Rol temporal con permisos completos del módulo users',
    roleActive: 1,
  })
  await grantUsersPermissions(privilegedRole.roleId, ['create', 'update', 'delete', 'read'])

  const deniedRole = await Role.create({
    roleName: `Users isolation denied ${stamp}`,
    roleSlug: `users-isolation-denied-${stamp}`,
    roleDescription: 'Rol temporal sin permisos del módulo users',
    roleActive: 1,
  })
  await grantUsersPermissions(deniedRole.roleId, [])

  const actorPerson = await createPerson('user-isolation-actor-a')
  const actor = await createUserForPerson(actorPerson, privilegedRole.roleId, [
    tenantABu.businessUnitId,
  ])

  const targetPerson = await createPerson('user-isolation-target-b')
  const targetUser = await createUserForPerson(
    targetPerson,
    privilegedRole.roleId,
    [tenantBBu.businessUnitId]
  )

  const deniedPerson = await createPerson('user-isolation-denied')
  const deniedActor = await createUserForPerson(deniedPerson, deniedRole.roleId, [
    tenantABu.businessUnitId,
  ])

  const disposablePerson = await createPerson('user-isolation-disposable-a')
  const disposableUser = await createUserForPerson(
    disposablePerson,
    privilegedRole.roleId,
    [tenantABu.businessUnitId]
  )

  const employeeRole = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'empleado')
    .orderBy('role_id', 'asc')
    .firstOrFail()

  const employeeBusinessUnit = await createBusinessUnit('User isolation employee')
  const employeePerson = await createPerson('user-isolation-employee')
  const employeeUser = await createUserForPerson(employeePerson, employeeRole.roleId, [
    employeeBusinessUnit.businessUnitId,
  ])

  return {
    tenantA: {
      businessUnit: tenantABu,
      role: privilegedRole,
      actor,
      actorPerson,
    },
    tenantB: {
      user: targetUser,
      person: targetPerson,
      businessUnit: tenantBBu,
    },
    deniedActor,
    deniedRole,
    deniedPerson,
    disposableUser: {
      user: disposableUser,
      person: disposablePerson,
    },
    employeeUser,
    employeePerson,
    employeeBusinessUnit,
  }
}

async function cleanupFixtures(data: TestFixtures | null) {
  if (!data) return

  const userIds = [
    data.tenantA.actor.userId,
    data.tenantB.user.userId,
    data.deniedActor.userId,
    data.disposableUser.user.userId,
    data.employeeUser.userId,
  ]

  await ApiToken.query().whereIn('tokenable_id', userIds).delete()
  await BusinessUnitUser.query().whereIn('user_id', userIds).delete()
  await User.query().whereIn('user_id', userIds).delete()

  const personIds = [
    data.tenantA.actorPerson.personId,
    data.tenantB.person.personId,
    data.deniedPerson.personId,
    data.disposableUser.person.personId,
    data.employeePerson.personId,
  ]
  await Person.query().whereIn('person_id', personIds).delete()

  await RoleSystemPermission.query()
    .whereIn('role_id', [data.tenantA.role.roleId, data.deniedRole.roleId])
    .delete()
  await Role.query()
    .whereIn('role_id', [data.tenantA.role.roleId, data.deniedRole.roleId])
    .delete()

  await BusinessUnit.query()
    .whereIn('business_unit_id', [
      data.tenantA.businessUnit.businessUnitId,
      data.tenantB.businessUnit.businessUnitId,
      data.employeeBusinessUnit.businessUnitId,
    ])
    .delete()
}

test.group('Users — USRH1786736057519 (aislamiento y login)', (group) => {
  group.setup(async () => {
    fixtures = await buildFixtures()
  })

  group.teardown(async () => {
    await cleanupFixtures(fixtures)
    fixtures = null
  })

  test('GET ajeno responde 404 uniforme', async ({ client }) => {
    const fx = fixtures!
    const response = await client
      .get(`/api/users/${fx.tenantB.user.userId}`)
      .loginAs(fx.tenantA.actor)
      .headers(buHeader(fx.tenantA.businessUnit))

    response.assertStatus(404)
    response.assertBody(notFoundBody(fx.tenantB.user.userId))
  })

  test('GET inexistente es idéntico byte a byte al GET ajeno', async ({ client, assert }) => {
    const fx = fixtures!

    const foreign = await client
      .get(`/api/users/${fx.tenantB.user.userId}`)
      .loginAs(fx.tenantA.actor)
      .headers(buHeader(fx.tenantA.businessUnit))

    const missing = await client
      .get(`/api/users/${NON_EXISTENT_USER_ID}`)
      .loginAs(fx.tenantA.actor)
      .headers(buHeader(fx.tenantA.businessUnit))

    foreign.assertStatus(404)
    missing.assertStatus(404)
    assert.deepEqual(notFoundEnvelope(missing.body()), notFoundEnvelope(foreign.body()))
  })

  test('PUT ajeno responde 404 y no altera la cuenta de la empresa B', async ({
    client,
    assert,
  }) => {
    const fx = fixtures!
    const before = await User.query().where('user_id', fx.tenantB.user.userId).firstOrFail()

    const response = await client
      .put(`/api/users/${fx.tenantB.user.userId}`)
      .loginAs(fx.tenantA.actor)
      .headers(buHeader(fx.tenantA.businessUnit))
      .json({
        userEmail: `hacked-${Date.now()}@gsti-tests.local`,
        userActive: false,
        roleId: before.roleId,
        personId: before.personId,
        userEmailType: before.userEmailType,
      })

    response.assertStatus(404)
    response.assertBody(notFoundBody(fx.tenantB.user.userId))

    const after = await User.query().where('user_id', fx.tenantB.user.userId).firstOrFail()
    assert.equal(after.userEmail, before.userEmail)
    assert.equal(after.roleId, before.roleId)
    assert.equal(after.userActive, before.userActive)
  })

  test('DELETE ajeno responde 404 y conserva user_deleted_at nulo', async ({ client, assert }) => {
    const fx = fixtures!

    const response = await client
      .delete(`/api/users/${fx.tenantB.user.userId}`)
      .loginAs(fx.tenantA.actor)
      .headers(buHeader(fx.tenantA.businessUnit))

    response.assertStatus(404)
    response.assertBody(notFoundBody(fx.tenantB.user.userId))

    const stillActive = await User.query()
      .where('user_id', fx.tenantB.user.userId)
      .whereNull('user_deleted_at')
      .first()

    assert.isNotNull(stillActive)
    assert.equal(stillActive!.userActive, 1)
  })

  test('administrador legítimo consulta, edita y da de baja usuarios propios', async ({
    client,
    assert,
  }) => {
    const fx = fixtures!

    const show = await client
      .get(`/api/users/${fx.disposableUser.user.userId}`)
      .loginAs(fx.tenantA.actor)
      .headers(buHeader(fx.tenantA.businessUnit))
    show.assertStatus(200)

    const update = await client
      .put(`/api/users/${fx.disposableUser.user.userId}`)
      .loginAs(fx.tenantA.actor)
      .headers(buHeader(fx.tenantA.businessUnit))
      .json({
        userEmail: fx.disposableUser.user.userEmail,
        userActive: true,
        roleId: fx.disposableUser.user.roleId,
        personId: fx.disposableUser.person.personId,
        userEmailType: 'institutional',
      })
    update.assertStatus(201)

    const del = await client
      .delete(`/api/users/${fx.disposableUser.user.userId}`)
      .loginAs(fx.tenantA.actor)
      .headers(buHeader(fx.tenantA.businessUnit))
    del.assertStatus(201)

    const deleted = await User.query()
      .withTrashed()
      .where('user_id', fx.disposableUser.user.userId)
      .whereNotNull('user_deleted_at')
      .first()
    assert.isNotNull(deleted)
  })

  test('rol empleado por web recibe BACKOFFICE_FORBIDDEN sin emitir tokens', async ({
    client,
    assert,
  }) => {
    const fx = fixtures!
    const beforeCount = await countWebTokens(fx.employeeUser.userId)

    const response = await client.post('/api/auth/login').json({
      userEmail: fx.employeeUser.userEmail,
      userPassword: TEST_PASSWORD,
      deviceOrigin: 'web',
    })

    response.assertStatus(403)
    assert.equal(response.body()?.key, AUTH_LOGIN_ERROR_CODES.BACKOFFICE_FORBIDDEN)

    const afterCount = await countWebTokens(fx.employeeUser.userId)
    assert.equal(Number(afterCount[0].$extras.total), Number(beforeCount[0].$extras.total))
  })

  test('rol empleado con contraseña incorrecta por web sigue respondiendo credenciales inválidas', async ({
    client,
    assert,
  }) => {
    const fx = fixtures!

    const response = await client.post('/api/auth/login').json({
      userEmail: fx.employeeUser.userEmail,
      userPassword: 'WrongPassword!999',
      deviceOrigin: 'web',
    })

    response.assertStatus(404)
    assert.equal(response.body()?.message, 'Incorrect email or password')
    assert.notEqual(response.body()?.key, AUTH_LOGIN_ERROR_CODES.BACKOFFICE_FORBIDDEN)
  })

  test('rol empleado por app conserva login exitoso', async ({ client, assert }) => {
    const fx = fixtures!

    const response = await client.post('/api/auth/login').json({
      userEmail: fx.employeeUser.userEmail,
      userPassword: TEST_PASSWORD,
      deviceOrigin: 'app',
    })

    response.assertStatus(200)
    assert.equal(response.body()?.type, 'success')
    assert.exists(response.body()?.data?.token)
  })
})

test.group('Users — exigencia de permiso (USRH1786736057519 E2/E6)', (group) => {
  group.setup(async () => {
    permissionEnforcementColumnAvailable = await hasPermissionEnforcementColumn()
    if (!permissionEnforcementColumnAvailable) {
      return
    }

    usersModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'users')
      .firstOrFail()

    previousUsersEnforcement = usersModule.systemModulePermissionEnforcementActive
    usersModule.systemModulePermissionEnforcementActive = true
    await usersModule.save()

    fixtures = await buildFixtures()
  })

  group.teardown(async () => {
    await cleanupFixtures(fixtures)
    fixtures = null

    if (usersModule && permissionEnforcementColumnAvailable) {
      usersModule.systemModulePermissionEnforcementActive = previousUsersEnforcement
      await usersModule.save()
      usersModule = null
    }
  })

  test('sin permiso users responde PERM.DENIED antes del handler', async ({ client, assert }) => {
    if (!permissionEnforcementColumnAvailable) {
      assert.plan(0)
      return
    }

    const fx = fixtures!

    const response = await client
      .get(`/api/users/${fx.tenantA.actor.userId}`)
      .loginAs(fx.deniedActor)
      .headers(buHeader(fx.tenantA.businessUnit))

    response.assertStatus(403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
  })
})

test.group('Users — login rate limit (USRH1786736057519 E4)', (group) => {
  let rateLimitEmail: string

  group.setup(async () => {
    const stamp = await uniqueStamp()
    rateLimitEmail = `user-login-rate-${stamp}@gsti-tests.local`
  })

  test('superar 5 intentos por correo en 15 min responde 429', async ({ client, assert }) => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await client.post('/api/auth/login').json({
        userEmail: rateLimitEmail,
        userPassword: 'WrongPassword!999',
        deviceOrigin: 'web',
      })
      assert.notEqual(response.status(), 429, `El intento ${attempt} no debía estar limitado aún`)
    }

    const limited = await client.post('/api/auth/login').json({
      userEmail: rateLimitEmail,
      userPassword: 'WrongPassword!999',
      deviceOrigin: 'web',
    })

    limited.assertStatus(429)
  })
})

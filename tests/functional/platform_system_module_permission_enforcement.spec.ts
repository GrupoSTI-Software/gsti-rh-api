import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import SystemModule from '#models/system_module'

const TEST_PASSWORD = 'PlatformSystemModuleTest123!'

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

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'PlatformSystemModule',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Platform System Module ${stamp}`,
    businessUnitSlug: `platform-system-module-${stamp}`,
    businessUnitLegalName: `Platform System Module Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

test.group('PUT /api/platform/system-modules/:id/permission-enforcement', (group) => {
  let platformAdmin: TestActor | null = null
  let tenantUser: TestActor | null = null
  let employees: SystemModule
  let users: SystemModule
  let enforcementColumnAvailable = false

  group.setup(async () => {
    enforcementColumnAvailable = await hasPermissionEnforcementColumn()
    if (!enforcementColumnAvailable) {
      return
    }

    employees = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employees.systemModulePermissionEnforcementActive = false
    await employees.save()

    users = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'users')
      .firstOrFail()
    users.systemModulePermissionEnforcementActive = false
    await users.save()

    platformAdmin = await createActor('platform-system-module-admin', true)
    tenantUser = await createActor('platform-system-module-tenant', false)
  })

  group.teardown(async () => {
    if (!enforcementColumnAvailable) {
      return
    }

    if (employees) {
      employees.systemModulePermissionEnforcementActive = false
      await employees.save()
    }
    if (users) {
      users.systemModulePermissionEnforcementActive = false
      await users.save()
    }
    await cleanupActor(platformAdmin)
    await cleanupActor(tenantUser)
  })

  test('platformAdmin puede encender y apagar permission enforcement', async ({
    client,
    assert,
  }) => {
    if (!enforcementColumnAvailable) {
      assert.plan(0)
      return
    }

    const on = await client
      .put(`/api/platform/system-modules/${employees.systemModuleId}/permission-enforcement`)
      .loginAs(platformAdmin!.user)
      .json({ active: true })

    on.assertStatus(200)
    assert.isTrue(on.body().data.systemModule.systemModulePermissionEnforcementActive)

    const off = await client
      .put(`/api/platform/system-modules/${employees.systemModuleId}/permission-enforcement`)
      .loginAs(platformAdmin!.user)
      .json({ active: false })

    off.assertStatus(200)
    assert.isFalse(off.body().data.systemModule.systemModulePermissionEnforcementActive)
  })

  test('usuario tenant no-platform recibe 403', async ({ client, assert }) => {
    if (!enforcementColumnAvailable) {
      assert.plan(0)
      return
    }

    const response = await client
      .put(`/api/platform/system-modules/${employees.systemModuleId}/permission-enforcement`)
      .loginAs(tenantUser!.user)
      .json({ active: true })

    response.assertStatus(403)
  })

  test('platformAdmin puede encender la exigencia del módulo users (USRH1786736057519 E6)', async ({
    client,
    assert,
  }) => {
    if (!enforcementColumnAvailable) {
      assert.plan(0)
      return
    }

    const on = await client
      .put(`/api/platform/system-modules/${users.systemModuleId}/permission-enforcement`)
      .loginAs(platformAdmin!.user)
      .json({ active: true })

    on.assertStatus(200)
    assert.isTrue(on.body().data.systemModule.systemModulePermissionEnforcementActive)

    const session = await client
      .get('/api/auth/session/permissions')
      .loginAs(tenantUser!.user)
      .header('X-Business-Unit-Id', tenantUser!.businessUnit.businessUnitPublicId)

    session.assertStatus(200)
    const usersNode = (session.body().data.modules as Array<{ slug: string; permissionEnforcementActive: boolean }>).find(
      (module) => module.slug === 'users'
    )
    assert.exists(usersNode)
    assert.isTrue(usersNode!.permissionEnforcementActive)

    const off = await client
      .put(`/api/platform/system-modules/${users.systemModuleId}/permission-enforcement`)
      .loginAs(platformAdmin!.user)
      .json({ active: false })

    off.assertStatus(200)
    assert.isFalse(off.body().data.systemModule.systemModulePermissionEnforcementActive)
  })
})

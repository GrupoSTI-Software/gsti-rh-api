import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import SystemModule from '#models/system_module'

const TEST_PASSWORD = 'PlatformSystemModuleTest123!'

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

  group.setup(async () => {
    employees = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employees.systemModulePermissionEnforcementActive = false
    await employees.save()

    platformAdmin = await createActor('platform-system-module-admin', true)
    tenantUser = await createActor('platform-system-module-tenant', false)
  })

  group.teardown(async () => {
    if (employees) {
      employees.systemModulePermissionEnforcementActive = false
      await employees.save()
    }
    await cleanupActor(platformAdmin)
    await cleanupActor(tenantUser)
  })

  test('platformAdmin puede encender y apagar permission enforcement', async ({
    client,
    assert,
  }) => {
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

  test('usuario tenant no-platform recibe 403', async ({ client }) => {
    const response = await client
      .put(`/api/platform/system-modules/${employees.systemModuleId}/permission-enforcement`)
      .loginAs(tenantUser!.user)
      .json({ active: true })

    response.assertStatus(403)
  })
})

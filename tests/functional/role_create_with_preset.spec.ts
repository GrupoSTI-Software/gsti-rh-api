import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import RoleSystemPermission from '#models/role_system_permission'
import RolePresetService from '#services/role_preset_service'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createRootActor(): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `role-create-preset-${stamp}@gsti-tests.local`
  const rootRole = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()
  const person = await Person.create({
    personFirstname: 'RoleCreatePreset',
    personLastname: 'Test',
    personSecondLastname: 'Functional',
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: 'RoleCreatePresetTest123!',
    userActive: 1,
    roleId: rootRole.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Role Create Preset ${stamp}`,
    businessUnitSlug: `role-create-preset-${stamp}`,
    businessUnitLegalName: `Role Create Preset Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupActor(actor: TenantActor) {
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

test.group('POST /api/roles con plantilla', (group) => {
  let actor: TenantActor
  const createdRoleIds: number[] = []

  group.setup(async () => {
    actor = await createRootActor()
  })

  group.teardown(async () => {
    for (const roleId of createdRoleIds) {
      await RoleSystemPermission.query().where('role_id', roleId).delete()
      await Role.query().where('role_id', roleId).delete()
    }
    await cleanupActor(actor)
  })

  test('con rolePresetSlug read-only nace con lecturas de empleados y devuelve la plantilla aplicada', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/roles')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        roleName: `Auditoría interna ${Date.now()}`,
        roleDescription: 'Alta con plantilla',
        roleActive: true,
        rolePresetSlug: 'read-only',
      })

    response.assertStatus(201)
    const body = response.body()
    const role = body.data.role
    createdRoleIds.push(role.roleId)

    assert.deepEqual(body.data.appliedPreset, {
      slug: 'read-only',
      version: new RolePresetService().list().find((item) => item.slug === 'read-only')!.version,
    })

    const grants = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', role.roleId)
      .preload('systemPermissions', (query) => query.preload('systemModule'))
    const employeeGrants = grants.filter(
      (grant) => grant.systemPermissions.systemModule.systemModuleSlug === 'employees'
    )
    const readOnlyPreset = new RolePresetService().list().find((item) => item.slug === 'read-only')!

    assert.deepEqual(
      employeeGrants.map((grant) => grant.systemPermissions.systemPermissionSlug).sort(),
      readOnlyPreset.permissions.map((permission) => permission.slug).sort()
    )
    const employeeKinds = employeeGrants.map(
      (grant) =>
        EMPLOYEES_PERMISSION_CATALOG.find(
          (permission) => permission.slug === grant.systemPermissions.systemPermissionSlug
        )!.kind
    )
    assert.isTrue(employeeKinds.every((kind) => kind === 'read'))
    assert.notInclude(
      employeeKinds,
      'write'
    )
    assert.notInclude(
      employeeKinds,
      'delete'
    )
  })

  test('sin rolePresetSlug crea el rol sin permisos', async ({ client, assert }) => {
    const response = await client
      .post('/api/roles')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        roleName: `Rol sin plantilla ${Date.now()}`,
        roleDescription: 'Alta sin permisos automáticos',
        roleActive: true,
      })

    response.assertStatus(201)
    const role = response.body().data.role
    createdRoleIds.push(role.roleId)

    const grants = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', role.roleId)
    assert.isEmpty(grants)
  })
})

import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RolePresetService from '#services/role_preset_service'

const TEST_PASSWORD = 'RolePresetsTest123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createActor(roleSlug: string, emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).first()
  if (!role) {
    throw new Error(`Se requiere el rol "${roleSlug}" en BD para este test.`)
  }

  const person = await Person.create({
    personFirstname: 'RolePresets',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Role Presets ${stamp}`,
    businessUnitSlug: `role-presets-${stamp}`,
    businessUnitLegalName: `Role Presets Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function loadGrants(roleId: number) {
  return RoleSystemPermission.query()
    .whereNull('role_system_permission_deleted_at')
    .where('role_id', roleId)
    .preload('systemPermissions', (query) => query.preload('systemModule'))
}

async function permissionId(moduleSlug: string, permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', moduleSlug)
    )
    .first()
  if (!permission) {
    throw new Error(
      `Se requiere el permiso "${moduleSlug}:${permissionSlug}" en BD para este test.`
    )
  }
  return permission.systemPermissionId
}

test.group('Role presets HTTP (USRH1785766406742)', (group) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  let actor: TenantActor | null = null
  let nonRootActor: TenantActor | null = null
  let targetRole: Role
  let ownerRole: Role
  let testModule: SystemModule
  let otherPermissionId: number
  let createPermissionId: number
  const foreignRoleIds: number[] = []

  group.setup(async () => {
    actor = await createActor('root', 'role-presets-root')
    nonRootActor = await createActor('rh-manager', 'role-presets-rh')
    targetRole = await Role.create({
      roleName: `Test Role Presets ${stamp}`,
      roleSlug: `test-role-presets-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: `${actor!.businessUnit.businessUnitSlug},${nonRootActor!.businessUnit.businessUnitSlug}`,
      roleManagementDays: 10,
    })
    ownerRole = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', 'owner')
      .firstOrFail()
    testModule = await SystemModule.create({
      systemModuleName: 'Role Presets Test Module',
      systemModuleSlug: `role-presets-test-module-${stamp}`,
      systemModuleDescription: 'Fixture de test',
      systemModules: '1',
      systemModulePath: `/role-presets-test-${stamp}`,
      systemModuleActive: 1,
      systemModuleOrder: 10,
      systemModuleIcon: '',
    })
    const otherPermission = await SystemPermission.create({
      systemPermissionName: 'Read',
      systemPermissionSlug: 'read',
      systemModuleId: testModule.systemModuleId,
    })
    otherPermissionId = otherPermission.systemPermissionId
    createPermissionId = await permissionId('employees', 'create')
  })

  group.teardown(async () => {
    for (const roleId of foreignRoleIds) {
      await RoleSystemPermission.query().where('role_id', roleId).delete()
      await Role.query().where('role_id', roleId).delete()
    }
    await RoleSystemPermission.query().where('role_id', targetRole.roleId).delete()
    await Role.query().where('role_id', targetRole.roleId).delete()
    await SystemPermission.query().where('system_module_id', testModule.systemModuleId).delete()
    await SystemModule.query().where('system_module_id', testModule.systemModuleId).delete()
    await cleanupActor(actor)
    await cleanupActor(nonRootActor)
  })

  test('GET lista las cuatro plantillas con versión y cantidad de permisos', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/role-presets')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    const presets = response.body().data.presets
    assert.lengthOf(presets, 4)
    for (const preset of presets) {
      assert.isString(preset.version)
      assert.isNumber(preset.permissionCount)
    }
  })

  test('preview y apply replace preservan otro módulo y sincronizan empleados', async ({
    client,
    assert,
  }) => {
    await RoleSystemPermission.query().where('role_id', targetRole.roleId).delete()
    await RoleSystemPermission.create({
      roleId: targetRole.roleId,
      systemPermissionId: createPermissionId,
    })
    await RoleSystemPermission.create({
      roleId: targetRole.roleId,
      systemPermissionId: otherPermissionId,
    })

    const previewResponse = await client
      .post(`/api/roles/${targetRole.roleId}/role-presets/preview`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ presetSlug: 'branch-supervisor', mode: 'replace' })
    previewResponse.assertStatus(200)
    const preview = previewResponse.body().data.preview

    const applyResponse = await client
      .post(`/api/roles/${targetRole.roleId}/role-presets/apply`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        presetSlug: 'branch-supervisor',
        mode: 'replace',
        expectedPresetVersion: preview.preset.version,
        baselinePermissionIds: preview.baselinePermissionIds,
      })
    applyResponse.assertStatus(201)

    const grants = await loadGrants(targetRole.roleId)
    const employeeSlugs = grants
      .filter((grant) => grant.systemPermissions.systemModule.systemModuleSlug === 'employees')
      .map((grant) => grant.systemPermissions.systemPermissionSlug)
      .sort()
    const preset = new RolePresetService().list().find((item) => item.slug === 'branch-supervisor')!
    assert.deepEqual(employeeSlugs, preset.permissions.map((permission) => permission.slug).sort())
    assert.include(
      grants.map((grant) => grant.systemPermissionId),
      otherPermissionId
    )
    assert.notInclude(
      grants.map((grant) => grant.systemPermissionId),
      createPermissionId
    )
  })

  test('preview merge no revoca y apply merge conserva grants de empleados previos', async ({
    client,
    assert,
  }) => {
    await RoleSystemPermission.query().where('role_id', targetRole.roleId).delete()
    await RoleSystemPermission.create({
      roleId: targetRole.roleId,
      systemPermissionId: createPermissionId,
    })

    const previewResponse = await client
      .post(`/api/roles/${targetRole.roleId}/role-presets/preview`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ presetSlug: 'branch-supervisor', mode: 'merge' })
    previewResponse.assertStatus(200)
    const preview = previewResponse.body().data.preview
    assert.isEmpty(preview.revoked)

    const applyResponse = await client
      .post(`/api/roles/${targetRole.roleId}/role-presets/apply`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        presetSlug: 'branch-supervisor',
        mode: 'merge',
        expectedPresetVersion: preview.preset.version,
        baselinePermissionIds: preview.baselinePermissionIds,
      })
    applyResponse.assertStatus(201)
    const grants = await loadGrants(targetRole.roleId)
    assert.include(
      grants.map((grant) => grant.systemPermissionId),
      createPermissionId
    )
  })

  test('apply sobre rol de sistema como no-root devuelve 403 sin cambios', async ({
    client,
    assert,
  }) => {
    const beforeGrants = await loadGrants(ownerRole.roleId)
    const before = beforeGrants.map((grant) => grant.systemPermissionId).sort()
    const preset = new RolePresetService().list()[0]
    const response = await client
      .post(`/api/roles/${ownerRole.roleId}/role-presets/apply`)
      .loginAs(nonRootActor!.user)
      .header('X-Business-Unit-Id', nonRootActor!.businessUnit.businessUnitPublicId)
      .json({
        presetSlug: preset.slug,
        mode: 'replace',
        expectedPresetVersion: preset.version,
        baselinePermissionIds: before,
      })

    response.assertStatus(403)
    assert.equal(response.body().key, 'rol-sistema-bloqueado')
    const afterGrants = await loadGrants(ownerRole.roleId)
    assert.deepEqual(afterGrants.map((grant) => grant.systemPermissionId).sort(), before)
  })

  test('preview y apply sobre un rol de otra empresa devuelven 404', async ({ client, assert }) => {
    const foreignRole = await Role.create({
      roleName: `Rol de otra empresa ${stamp}`,
      roleSlug: `foreign-role-presets-${stamp}`,
      roleDescription: 'Fixture de otro tenant',
      roleActive: 1,
      roleBusinessAccess: nonRootActor!.businessUnit.businessUnitSlug,
      roleManagementDays: 10,
    })
    foreignRoleIds.push(foreignRole.roleId)

    const previewResponse = await client
      .post(`/api/roles/${foreignRole.roleId}/role-presets/preview`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ presetSlug: 'read-only', mode: 'replace' })
    previewResponse.assertStatus(404)
    assert.equal(previewResponse.body().key, 'rol-no-encontrado')

    const applyResponse = await client
      .post(`/api/roles/${foreignRole.roleId}/role-presets/apply`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        presetSlug: 'read-only',
        mode: 'replace',
        expectedPresetVersion: new RolePresetService()
          .list()
          .find((item) => item.slug === 'read-only')!.version,
        baselinePermissionIds: [],
      })
    applyResponse.assertStatus(404)
    assert.equal(applyResponse.body().key, 'rol-no-encontrado')
    assert.isEmpty(await loadGrants(foreignRole.roleId))
  })

  test('apply con baseline vieja devuelve 409 y no cambia la base', async ({ client, assert }) => {
    await RoleSystemPermission.query().where('role_id', targetRole.roleId).delete()
    const previewResponse = await client
      .post(`/api/roles/${targetRole.roleId}/role-presets/preview`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ presetSlug: 'read-only', mode: 'replace' })
    previewResponse.assertStatus(200)
    const preview = previewResponse.body().data.preview
    await RoleSystemPermission.create({
      roleId: targetRole.roleId,
      systemPermissionId: otherPermissionId,
    })
    const beforeGrants = await loadGrants(targetRole.roleId)
    const before = beforeGrants.map((grant) => grant.systemPermissionId).sort()

    const response = await client
      .post(`/api/roles/${targetRole.roleId}/role-presets/apply`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        presetSlug: 'read-only',
        mode: 'replace',
        expectedPresetVersion: preview.preset.version,
        baselinePermissionIds: preview.baselinePermissionIds,
      })

    response.assertStatus(409)
    assert.equal(response.body().key, 'rol-permisos-cambiaron')
    const afterGrants = await loadGrants(targetRole.roleId)
    assert.deepEqual(afterGrants.map((grant) => grant.systemPermissionId).sort(), before)
  })
})

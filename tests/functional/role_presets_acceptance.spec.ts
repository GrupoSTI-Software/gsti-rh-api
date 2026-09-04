import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RolePresetService from '#services/role_preset_service'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

interface Actor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createActor(roleSlug = 'root'): Promise<Actor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const role = await Role.query().where('role_slug', roleSlug).firstOrFail()
  const person = await Person.create({
    personFirstname: 'RolePresetAcceptance',
    personLastname: 'Test',
    personSecondLastname: stamp,
    personEmail: `role-preset-acceptance-${stamp}@gsti-tests.local`,
  })
  const user = await User.create({
    userEmail: person.personEmail!,
    userPassword: 'RolePresetAcceptance123!',
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Role preset acceptance ${stamp}`,
    businessUnitSlug: `role-preset-acceptance-${stamp}`,
    businessUnitLegalName: `Role preset acceptance legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupActor(actor: Actor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function grants(roleId: number) {
  return RoleSystemPermission.query()
    .whereNull('role_system_permission_deleted_at')
    .where('role_id', roleId)
    .preload('systemPermissions', (query) => query.preload('systemModule'))
}

async function permission(moduleSlug: string, permissionSlug: string) {
  return SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) => query.where('system_module_slug', moduleSlug))
    .firstOrFail()
}

test.group('Aceptación de reglas de plantillas de roles (A–G)', (group) => {
  let actor: Actor | null = null
  let lockedActor: Actor | null = null
  let role: Role
  let otherModule: SystemModule
  let otherPermission: SystemPermission
  const createdRoleIds: number[] = []

  group.setup(async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    actor = await createActor()
    lockedActor = await createActor('rh-manager')
    role = await Role.create({
      roleName: `Acceptance role ${stamp}`,
      roleSlug: `acceptance-role-${stamp}`,
      roleDescription: 'Fixture de aceptación',
      roleActive: 1,
      roleBusinessAccess: actor!.businessUnit.businessUnitSlug,
      roleManagementDays: 10,
    })
    otherModule = await SystemModule.create({
      systemModuleName: 'Acceptance other module',
      systemModuleSlug: `acceptance-other-${stamp}`,
      systemModuleDescription: 'Fixture de aceptación',
      systemModules: '1',
      systemModulePath: `/acceptance-other-${stamp}`,
      systemModuleActive: 1,
      systemModuleOrder: 10,
      systemModuleIcon: '',
    })
    otherPermission = await SystemPermission.create({
      systemPermissionName: 'Consulta externa',
      systemPermissionSlug: 'acceptance-read',
      systemModuleId: otherModule.systemModuleId,
    })
  })

  group.each.setup(async () => {
    await RoleSystemPermission.query().where('role_id', role.roleId).delete()
  })

  group.teardown(async () => {
    for (const roleId of createdRoleIds) {
      await RoleSystemPermission.query().where('role_id', roleId).delete()
      await Role.query().where('role_id', roleId).delete()
    }
    await RoleSystemPermission.query().where('role_id', role.roleId).delete()
    await Role.query().where('role_id', role.roleId).delete()
    await SystemPermission.query()
      .where('system_permission_id', otherPermission.systemPermissionId)
      .delete()
    await SystemModule.query().where('system_module_id', otherModule.systemModuleId).delete()
    await cleanupActor(actor)
    await cleanupActor(lockedActor)
  })

  test('A: replace reporta granted/revoked/unchanged, aplica igual y conserva otro módulo', async ({
    client,
    assert,
  }) => {
    const current = await permission('employees', 'create')
    const unchanged = await permission('employees', 'read')
    await RoleSystemPermission.createMany([
      { roleId: role.roleId, systemPermissionId: current.systemPermissionId },
      { roleId: role.roleId, systemPermissionId: unchanged.systemPermissionId },
      { roleId: role.roleId, systemPermissionId: otherPermission.systemPermissionId },
    ])
    const previewResponse = await client
      .post(`/api/roles/${role.roleId}/role-presets/preview`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ presetSlug: 'branch-supervisor', mode: 'replace' })
    previewResponse.assertStatus(200)
    const preview = previewResponse.body().data.preview
    assert.isAbove(preview.granted.length, 0)
    assert.isAbove(preview.revoked.length, 0)
    assert.isAbove(preview.unchanged.length, 0)
    assert.isTrue(
      preview.granted.every((item: { moduleSlug: string }) => item.moduleSlug === 'employees')
    )
    const applyResponse = await client
      .post(`/api/roles/${role.roleId}/role-presets/apply`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        presetSlug: 'branch-supervisor',
        mode: 'replace',
        expectedPresetVersion: preview.preset.version,
        baselinePermissionIds: preview.baselinePermissionIds,
      })
    applyResponse.assertStatus(201)
    const after = await grants(role.roleId)
    assert.include(
      after.map((grant) => grant.systemPermissionId),
      otherPermission.systemPermissionId
    )
    assert.notInclude(
      after.map((grant) => grant.systemPermissionId),
      current.systemPermissionId
    )
    assert.deepEqual(
      after
        .filter((grant) => grant.systemPermissions.systemModule.systemModuleSlug === 'employees')
        .map((grant) => grant.systemPermissions.systemPermissionSlug)
        .sort(),
      new RolePresetService()
        .list()
        .find((preset) => preset.slug === 'branch-supervisor')!
        .permissions.map((item) => item.slug)
        .sort()
    )
  })

  test('B: merge para Recepción + Capturista no revoca y conserva permisos previos', async ({
    client,
    assert,
  }) => {
    const previous = await permission('employees', 'sensitive-financiero-read')
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: previous.systemPermissionId,
    })
    const response = await client
      .post(`/api/roles/${role.roleId}/role-presets/preview`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({ presetSlug: 'data-entry', mode: 'merge' })
    response.assertStatus(200)
    const preview = response.body().data.preview
    assert.isEmpty(preview.revoked)
    const apply = await client
      .post(`/api/roles/${role.roleId}/role-presets/apply`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        presetSlug: 'data-entry',
        mode: 'merge',
        expectedPresetVersion: preview.preset.version,
        baselinePermissionIds: preview.baselinePermissionIds,
      })
    apply.assertStatus(201)
    const after = await grants(role.roleId)
    assert.include(
      after.map((grant) => grant.systemPermissionId),
      previous.systemPermissionId
    )
  })

  test('C: alta de Auditoría con Consulta solo crea permisos read', async ({ client, assert }) => {
    const response = await client
      .post('/api/roles')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        roleName: `Auditoría de aceptación ${Date.now()}`,
        roleDescription: 'Consulta',
        roleActive: true,
        rolePresetSlug: 'read-only',
      })
    response.assertStatus(201)
    const created = response.body().data.role
    createdRoleIds.push(created.roleId)
    const createdGrants = await grants(created.roleId)
    assert.isNotEmpty(createdGrants)
    assert.isTrue(
      createdGrants.every(
        (grant) =>
          EMPLOYEES_PERMISSION_CATALOG.find(
            (item) => item.slug === grant.systemPermissions.systemPermissionSlug
          )?.kind === 'read'
      )
    )
  })

  test('D: permiso faltante responde 422, informa slug y conserva grants', async ({
    client,
    assert,
  }) => {
    const existing = await permission('employees', 'read')
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: otherPermission.systemPermissionId,
    })
    await existing.delete()
    try {
      const response = await client
        .post(`/api/roles/${role.roleId}/role-presets/preview`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
        .json({ presetSlug: 'read-only', mode: 'replace' })
      response.assertStatus(422)
      assert.equal(response.body().key, 'plantilla-permisos-faltantes')
      assert.include(response.body().data.missing, 'read')
      const after = await grants(role.roleId)
      assert.deepEqual(
        after.map((grant) => grant.systemPermissionId),
        [otherPermission.systemPermissionId]
      )
    } finally {
      await existing.restore()
    }
  })

  test('E: fallo posterior al apply revierte toda la transacción', async ({ assert }) => {
    const previous = await permission('employees', 'read')
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: previous.systemPermissionId,
    })
    const service = new RolePresetService()
    const preview = await service.preview(role.roleId, 'data-entry', 'replace')
    await assert.rejects(() =>
      db.transaction(async (trx) => {
        await service.apply(
          role.roleId,
          {
            presetSlug: 'data-entry',
            mode: 'replace',
            expectedPresetVersion: preview.preset.version,
            baselinePermissionIds: preview.baselinePermissionIds,
          },
          trx
        )
        throw new Error('fallo mid-apply de aceptación')
      })
    )
    const after = await grants(role.roleId)
    assert.deepEqual(
      after.map((grant) => grant.systemPermissionId),
      [previous.systemPermissionId]
    )
  })

  test('F: rol sistema devuelve 403 y no modifica grants', async ({ client, assert }) => {
    const owner = await Role.query().where('role_slug', 'owner').firstOrFail()
    const beforeGrants = await grants(owner.roleId)
    const before = beforeGrants.map((grant) => grant.systemPermissionId).sort()
    const response = await client
      .post(`/api/roles/${owner.roleId}/role-presets/apply`)
      .loginAs(lockedActor!.user)
      .header('X-Business-Unit-Id', lockedActor!.businessUnit.businessUnitPublicId)
      .json({
        presetSlug: 'read-only',
        mode: 'replace',
        expectedPresetVersion: '1.0.0',
        baselinePermissionIds: before,
      })
    response.assertStatus(403)
    assert.equal(response.body().key, 'rol-sistema-bloqueado')
    const after = await grants(owner.roleId)
    assert.deepEqual(after.map((grant) => grant.systemPermissionId).sort(), before)
  })

  test('G: listar plantillas no crea role_system_permissions automáticamente', async ({
    client,
    assert,
  }) => {
    const before = await RoleSystemPermission.query().where('role_id', role.roleId)
    const response = await client
      .get('/api/role-presets')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    response.assertStatus(200)
    assert.lengthOf(await RoleSystemPermission.query().where('role_id', role.roleId), before.length)
  })
})

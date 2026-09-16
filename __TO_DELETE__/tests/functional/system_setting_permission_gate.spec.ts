import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import SystemSetting from '#models/system_setting'

/**
 * USRH1789018905994 — Anexo A automatizado: soft-rollout apagado, exigencia ON
 * con permiso (9 vías), sin permiso (9× PERM.DENIED) y permiso dedicado RH.
 */

const TEST_PASSWORD = 'SystemSettingPermissionGate123!'
const ALL_MODULE_PERMISSIONS = [
  'read',
  'create',
  'update',
  'delete',
  'manage-attendance-fault-hr-emails',
] as const

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

function buHeader(businessUnit: BusinessUnit) {
  return { 'X-Business-Unit-Id': businessUnit.businessUnitPublicId }
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
    throw new Error(`Se requiere el permiso "${moduleSlug}:${permissionSlug}" en BD para este test.`)
  }

  return permission.systemPermissionId
}

async function grantModuleOnly(
  roleId: number,
  moduleSlug: string,
  permissionSlugs: readonly string[]
) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId(moduleSlug, slug),
    })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `System settings gate ${stamp}`,
    businessUnitSlug: `system-settings-gate-${stamp}`,
    businessUnitLegalName: `System settings gate legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `System settings gate ${stamp}`,
    roleSlug: `system-settings-gate-${stamp}`,
    roleDescription: 'Rol temporal de QA system settings permission gate',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'SystemSettingGate',
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
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit, role }
}

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function createEmptyBusinessUnit(label: string): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  return BusinessUnit.create({
    businessUnitName: `System settings gate ${label} ${stamp}`,
    businessUnitSlug: `system-settings-gate-${label}-${stamp}`,
    businessUnitLegalName: `System settings gate ${label} legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createSystemSetting(businessUnit: BusinessUnit): Promise<SystemSetting> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  return SystemSetting.create({
    businessUnitId: businessUnit.businessUnitId,
    systemSettingTradeName: `Gate Trade ${stamp}`,
    systemSettingSidebarColor: '#abcdef',
    systemSettingActive: 1,
    systemSettingBusinessUnits: businessUnit.businessUnitSlug,
    systemSettingBirthdayEmails: 0,
    systemSettingAnniversaryEmails: 0,
    systemSettingAttendanceFaultHrEmails: 0,
    systemSettingEmployeeAplicationIcon: `https://cdn.example.test/icon-${stamp}.png`,
  })
}

async function attachBusinessUnit(user: User, businessUnitId: number) {
  await user.related('businessUnits').attach([businessUnitId])
}

async function cleanupBusinessUnit(businessUnitId: number) {
  await BusinessUnitUser.query().where('business_unit_id', businessUnitId).delete()
  await SystemSetting.query().withTrashed().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

function expectDenied(
  response: { status: () => number; body: () => { key?: string } },
  assert: { equal: (a: unknown, b: unknown) => void }
) {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, 'PERM.DENIED')
}

function expectNotDenied(
  response: { status: () => number; body: () => { key?: string } },
  assert: {
    notEqual: (a: unknown, b: unknown) => void
    isBelow: (a: number, b: number) => void
  }
) {
  assert.notEqual(response.status(), 403)
  assert.notEqual(response.body()?.key, 'PERM.DENIED')
  assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  assert.isBelow(response.status(), 500)
}

async function assertEnforcementDisabled(module: SystemModule) {
  const current = await SystemModule.findOrFail(module.systemModuleId)
  if (current.systemModulePermissionEnforcementActive !== false) {
    throw new Error('La exigencia de system-settings debe quedar apagada tras el suite.')
  }
}

test.group('System settings — PermissionGate soft-rollout', (group) => {
  let systemSettingsModule: SystemModule
  let actor: TenantActor | null = null
  let systemSetting: SystemSetting | null = null

  group.setup(async () => {
    systemSettingsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'system-settings')
      .firstOrFail()
    systemSettingsModule.systemModulePermissionEnforcementActive = false
    await systemSettingsModule.save()
    actor = await createActor('system-settings-gate-off')
    await grantModuleOnly(actor.role.roleId, 'system-settings', [])
    systemSetting = await createSystemSetting(actor.businessUnit)
  })

  group.teardown(async () => {
    try {
      if (systemSetting?.systemSettingId) {
        await SystemSetting.query()
          .withTrashed()
          .where('system_setting_id', systemSetting.systemSettingId)
          .delete()
      }
      await cleanupActor(actor)
    } finally {
      systemSettingsModule.systemModulePermissionEnforcementActive = false
      await systemSettingsModule.save()
      await assertEnforcementDisabled(systemSettingsModule)
    }
  })

  test('con exigencia apagada, las 9 rutas no responden PERM.DENIED', async ({ client, assert }) => {
    const headers = buHeader(actor!.businessUnit)
    const settingId = systemSetting!.systemSettingId

    const birthday = await client
      .put(`/api/system-settings/${settingId}/birthday-emails`)
      .json({ systemSettingBirthdayEmails: true })
      .loginAs(actor!.user)
      .headers(headers)
    expectNotDenied(birthday, assert)

    const anniversary = await client
      .put(`/api/system-settings/${settingId}/anniversary-emails`)
      .json({ systemSettingAnniversaryEmails: true })
      .loginAs(actor!.user)
      .headers(headers)
    expectNotDenied(anniversary, assert)

    const attendance = await client
      .put(`/api/system-settings/${settingId}/attendance-fault-hr-emails`)
      .json({ systemSettingAttendanceFaultHrEmails: true })
      .loginAs(actor!.user)
      .headers(headers)
    expectNotDenied(attendance, assert)

    const icon = await client
      .post(`/api/system-settings/${settingId}/employee-application-icon`)
      .loginAs(actor!.user)
      .headers(headers)
    expectNotDenied(icon, assert)

    const index = await client.get('/api/system-settings').loginAs(actor!.user).headers(headers)
    expectNotDenied(index, assert)

    const storeBusinessUnit = await createEmptyBusinessUnit('store-off')
    await attachBusinessUnit(actor!.user, storeBusinessUnit.businessUnitId)
    try {
      const store = await client
        .post('/api/system-settings')
        .json({
          systemSettingTradeName: `Soft rollout ${Date.now()}`,
          systemSettingSidebarColor: '#111111',
        })
        .loginAs(actor!.user)
        .headers(buHeader(storeBusinessUnit))
      expectNotDenied(store, assert)
    } finally {
      await cleanupBusinessUnit(storeBusinessUnit.businessUnitId)
    }

    const update = await client
      .put(`/api/system-settings/${settingId}`)
      .json({
        systemSettingTradeName: systemSetting!.systemSettingTradeName,
        systemSettingSidebarColor: '#222222',
      })
      .loginAs(actor!.user)
      .headers(headers)
    expectNotDenied(update, assert)

    const show = await client
      .get(`/api/system-settings/${settingId}`)
      .loginAs(actor!.user)
      .headers(headers)
    expectNotDenied(show, assert)

    const deleteBusinessUnit = await createEmptyBusinessUnit('delete-off')
    await attachBusinessUnit(actor!.user, deleteBusinessUnit.businessUnitId)
    const disposable = await createSystemSetting(deleteBusinessUnit)
    try {
      const del = await client
        .delete(`/api/system-settings/${disposable.systemSettingId}`)
        .loginAs(actor!.user)
        .headers(buHeader(deleteBusinessUnit))
      expectNotDenied(del, assert)
    } finally {
      await cleanupBusinessUnit(deleteBusinessUnit.businessUnitId)
    }
  })
})

test.group('System settings — PermissionGate exigencia ON con permisos', (group) => {
  let systemSettingsModule: SystemModule
  let actor: TenantActor | null = null
  let systemSetting: SystemSetting | null = null

  group.setup(async () => {
    systemSettingsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'system-settings')
      .firstOrFail()
    actor = await createActor('system-settings-gate-on')
    systemSetting = await createSystemSetting(actor.businessUnit)
    await grantModuleOnly(actor.role.roleId, 'system-settings', ALL_MODULE_PERMISSIONS)
    systemSettingsModule.systemModulePermissionEnforcementActive = true
    await systemSettingsModule.save()
  })

  group.teardown(async () => {
    try {
      if (systemSetting?.systemSettingId) {
        await SystemSetting.query()
          .withTrashed()
          .where('system_setting_id', systemSetting.systemSettingId)
          .delete()
      }
      await cleanupActor(actor)
    } finally {
      systemSettingsModule.systemModulePermissionEnforcementActive = false
      await systemSettingsModule.save()
      await assertEnforcementDisabled(systemSettingsModule)
    }
  })

  test('con los cinco permisos concedidos, las 9 rutas no responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const headers = buHeader(actor!.businessUnit)
    const settingId = systemSetting!.systemSettingId

    expectNotDenied(
      await client
        .put(`/api/system-settings/${settingId}/birthday-emails`)
        .json({ systemSettingBirthdayEmails: true })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectNotDenied(
      await client
        .put(`/api/system-settings/${settingId}/anniversary-emails`)
        .json({ systemSettingAnniversaryEmails: true })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectNotDenied(
      await client
        .put(`/api/system-settings/${settingId}/attendance-fault-hr-emails`)
        .json({ systemSettingAttendanceFaultHrEmails: true })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectNotDenied(
      await client
        .post(`/api/system-settings/${settingId}/employee-application-icon`)
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectNotDenied(
      await client.get('/api/system-settings').loginAs(actor!.user).headers(headers),
      assert
    )
    const storeBusinessUnit = await createEmptyBusinessUnit('store-on')
    await attachBusinessUnit(actor!.user, storeBusinessUnit.businessUnitId)
    try {
      expectNotDenied(
        await client
          .post('/api/system-settings')
          .json({
            systemSettingTradeName: `Granted ${Date.now()}`,
            systemSettingSidebarColor: '#333333',
          })
          .loginAs(actor!.user)
          .headers(buHeader(storeBusinessUnit)),
        assert
      )
    } finally {
      await cleanupBusinessUnit(storeBusinessUnit.businessUnitId)
    }
    expectNotDenied(
      await client
        .put(`/api/system-settings/${settingId}`)
        .json({
          systemSettingTradeName: systemSetting!.systemSettingTradeName,
          systemSettingSidebarColor: '#444444',
        })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectNotDenied(
      await client
        .get(`/api/system-settings/${settingId}`)
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )

    const deleteBusinessUnit = await createEmptyBusinessUnit('delete-on')
    await attachBusinessUnit(actor!.user, deleteBusinessUnit.businessUnitId)
    const disposable = await createSystemSetting(deleteBusinessUnit)
    try {
      expectNotDenied(
        await client
          .delete(`/api/system-settings/${disposable.systemSettingId}`)
          .loginAs(actor!.user)
          .headers(buHeader(deleteBusinessUnit)),
        assert
      )
    } finally {
      await cleanupBusinessUnit(deleteBusinessUnit.businessUnitId)
    }
  })
})

test.group('System settings — PermissionGate exigencia ON sin permisos', (group) => {
  let systemSettingsModule: SystemModule
  let actor: TenantActor | null = null
  let systemSetting: SystemSetting | null = null

  group.setup(async () => {
    systemSettingsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'system-settings')
      .firstOrFail()
    actor = await createActor('system-settings-gate-denied')
    systemSetting = await createSystemSetting(actor.businessUnit)
    await grantModuleOnly(actor.role.roleId, 'system-settings', [])
    systemSettingsModule.systemModulePermissionEnforcementActive = true
    await systemSettingsModule.save()
  })

  group.teardown(async () => {
    try {
      if (systemSetting?.systemSettingId) {
        await SystemSetting.query()
          .withTrashed()
          .where('system_setting_id', systemSetting.systemSettingId)
          .delete()
      }
      await cleanupActor(actor)
    } finally {
      systemSettingsModule.systemModulePermissionEnforcementActive = false
      await systemSettingsModule.save()
      await assertEnforcementDisabled(systemSettingsModule)
    }
  })

  test('sin permisos del módulo, las 9 rutas responden PERM.DENIED', async ({ client, assert }) => {
    const headers = buHeader(actor!.businessUnit)
    const settingId = systemSetting!.systemSettingId

    expectDenied(
      await client
        .put(`/api/system-settings/${settingId}/birthday-emails`)
        .json({ systemSettingBirthdayEmails: true })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectDenied(
      await client
        .put(`/api/system-settings/${settingId}/anniversary-emails`)
        .json({ systemSettingAnniversaryEmails: true })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectDenied(
      await client
        .put(`/api/system-settings/${settingId}/attendance-fault-hr-emails`)
        .json({ systemSettingAttendanceFaultHrEmails: true })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectDenied(
      await client
        .post(`/api/system-settings/${settingId}/employee-application-icon`)
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectDenied(
      await client.get('/api/system-settings').loginAs(actor!.user).headers(headers),
      assert
    )
    expectDenied(
      await client
        .post('/api/system-settings')
        .json({
          systemSettingTradeName: `Denied ${Date.now()}`,
          systemSettingSidebarColor: '#555555',
        })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectDenied(
      await client
        .put(`/api/system-settings/${settingId}`)
        .json({
          systemSettingTradeName: systemSetting!.systemSettingTradeName,
          systemSettingSidebarColor: '#666666',
        })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectDenied(
      await client
        .get(`/api/system-settings/${settingId}`)
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )
    expectDenied(
      await client
        .delete(`/api/system-settings/${settingId}`)
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )

    const stillThere = await SystemSetting.query()
      .where('system_setting_id', settingId)
      .whereNull('system_setting_deleted_at')
      .first()
    assert.exists(stillThere)
  })
})

test.group('System settings — permiso dedicado RH por faltas (CA-4)', (group) => {
  let systemSettingsModule: SystemModule
  let actor: TenantActor | null = null
  let systemSetting: SystemSetting | null = null

  group.setup(async () => {
    systemSettingsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'system-settings')
      .firstOrFail()
    actor = await createActor('system-settings-gate-rh')
    systemSetting = await createSystemSetting(actor.businessUnit)
    await grantModuleOnly(actor.role.roleId, 'system-settings', ['read', 'create', 'update', 'delete'])
    systemSettingsModule.systemModulePermissionEnforcementActive = true
    await systemSettingsModule.save()
  })

  group.teardown(async () => {
    try {
      if (systemSetting?.systemSettingId) {
        await SystemSetting.query()
          .withTrashed()
          .where('system_setting_id', systemSetting.systemSettingId)
          .delete()
      }
      await cleanupActor(actor)
    } finally {
      systemSettingsModule.systemModulePermissionEnforcementActive = false
      await systemSettingsModule.save()
      await assertEnforcementDisabled(systemSettingsModule)
    }
  })

  test('con update pero sin manage-attendance-fault-hr-emails, RH responde PERM.DENIED y update sigue', async ({
    client,
    assert,
  }) => {
    const headers = buHeader(actor!.businessUnit)
    const settingId = systemSetting!.systemSettingId
    const before = systemSetting!.systemSettingAttendanceFaultHrEmails

    expectDenied(
      await client
        .put(`/api/system-settings/${settingId}/attendance-fault-hr-emails`)
        .json({ systemSettingAttendanceFaultHrEmails: true })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )

    expectNotDenied(
      await client
        .put(`/api/system-settings/${settingId}/birthday-emails`)
        .json({ systemSettingBirthdayEmails: true })
        .loginAs(actor!.user)
        .headers(headers),
      assert
    )

    const reloaded = await SystemSetting.query().where('system_setting_id', settingId).firstOrFail()
    assert.equal(reloaded.systemSettingAttendanceFaultHrEmails, before)
  })
})

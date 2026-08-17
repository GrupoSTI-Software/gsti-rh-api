import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import RoleService from '#services/role_service'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

test.group('RoleService.assignPermissions — trx opcional', (group) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  let role: Role
  let systemModule: SystemModule
  let permission: SystemPermission

  group.setup(async () => {
    role = await Role.create({
      roleName: `Test Assign Trx ${stamp}`,
      roleSlug: `test-assign-trx-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
    })
    systemModule = await SystemModule.create({
      systemModuleName: 'Test Assign Trx Module',
      systemModuleSlug: `test-assign-trx-module-${stamp}`,
      systemModuleDescription: 'Fixture de test',
      systemModules: '1',
      systemModulePath: `/test-assign-trx-${stamp}`,
      systemModuleGroup: 'test',
      systemModuleActive: 1,
      systemModuleIcon: '',
    })
    permission = await SystemPermission.create({
      systemPermissionName: 'Read',
      systemPermissionSlug: 'read',
      systemModuleId: systemModule.systemModuleId,
    })
  })

  group.teardown(async () => {
    await RoleSystemPermission.query().where('role_id', role.roleId).delete()
    await SystemPermission.query().where('system_permission_id', permission.systemPermissionId).delete()
    await SystemModule.query().where('system_module_id', systemModule.systemModuleId).delete()
    await Role.query().where('role_id', role.roleId).delete()
  })

  test('si la transacción se revierte, no persiste ningún permiso asignado dentro de ella', async ({ assert }) => {
    const roleService = new RoleService()

    try {
      await db.transaction(async (trx) => {
        await roleService.assignPermissions(role.roleId, [permission.systemPermissionId], trx)
        throw new Error('rollback forzado para el test')
      })
    } catch {
      // Se espera: el rollback forzado propaga el error.
    }

    const grants = await RoleSystemPermission.query().where('role_id', role.roleId)
    assert.lengthOf(grants, 0)
  })

  test('si la transacción se confirma, persiste el permiso asignado', async ({ assert }) => {
    const roleService = new RoleService()

    await db.transaction(async (trx) => {
      await roleService.assignPermissions(role.roleId, [permission.systemPermissionId], trx)
    })

    const grants = await RoleSystemPermission.query().where('role_id', role.roleId)
    assert.lengthOf(grants, 1)
    assert.equal(grants[0].systemPermissionId, permission.systemPermissionId)
  })
})

test.group('RoleService.assignPermissionsBatch — lote atómico', (group) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  let roleA: Role
  let roleB: Role
  let systemModule: SystemModule
  let permission: SystemPermission

  group.setup(async () => {
    roleA = await Role.create({
      roleName: `Test Batch A ${stamp}`,
      roleSlug: `test-batch-a-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 10,
    })
    roleB = await Role.create({
      roleName: `Test Batch B ${stamp}`,
      roleSlug: `test-batch-b-${stamp}`,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
      roleManagementDays: 20,
    })
    systemModule = await SystemModule.create({
      systemModuleName: 'Test Batch Module',
      systemModuleSlug: `test-batch-module-${stamp}`,
      systemModuleDescription: 'Fixture de test',
      systemModules: '1',
      systemModulePath: `/test-batch-${stamp}`,
      systemModuleGroup: 'test',
      systemModuleActive: 1,
      systemModuleIcon: '',
    })
    permission = await SystemPermission.create({
      systemPermissionName: 'Read',
      systemPermissionSlug: 'read',
      systemModuleId: systemModule.systemModuleId,
    })
  })

  group.teardown(async () => {
    await RoleSystemPermission.query().where('role_id', roleA.roleId).delete()
    await RoleSystemPermission.query().where('role_id', roleB.roleId).delete()
    await SystemPermission.query().where('system_permission_id', permission.systemPermissionId).delete()
    await SystemModule.query().where('system_module_id', systemModule.systemModuleId).delete()
    await Role.query().where('role_id', roleA.roleId).delete()
    await Role.query().where('role_id', roleB.roleId).delete()
  })

  // Cada test reinicia days y grants para no depender del orden de ejecución.
  // Se usa `.update()` en lugar de `model.save()` porque el dirty-tracking de
  // Lucid no detecta cambios cuando el valor en memoria ya coincide con el
  // valor a reescribir.
  group.each.setup(async () => {
    await RoleSystemPermission.query().where('role_id', roleA.roleId).delete()
    await RoleSystemPermission.query().where('role_id', roleB.roleId).delete()
    await Role.query().where('role_id', roleA.roleId).update({ role_management_days: 10 })
    await Role.query().where('role_id', roleB.roleId).update({ role_management_days: 20 })
    roleA.roleManagementDays = 10
    roleB.roleManagementDays = 20
  })

  test('assignPermissionsBatch: aplica roleManagementDays y permisos a cada rol del lote', async ({
    assert,
  }) => {
    const roleService = new RoleService()

    await db.transaction(async (trx) => {
      await roleService.assignPermissionsBatch(
        [
          { roleId: roleA.roleId, permissions: [permission.systemPermissionId], roleManagementDays: 15 },
          { roleId: roleB.roleId, permissions: [permission.systemPermissionId], roleManagementDays: 25 },
        ],
        trx
      )
    })

    const reloadedA = await Role.query().where('role_id', roleA.roleId).firstOrFail()
    const reloadedB = await Role.query().where('role_id', roleB.roleId).firstOrFail()
    assert.equal(reloadedA.roleManagementDays, 15)
    assert.equal(reloadedB.roleManagementDays, 25)

    const grantsA = await RoleSystemPermission.query().where('role_id', roleA.roleId)
    const grantsB = await RoleSystemPermission.query().where('role_id', roleB.roleId)
    assert.lengthOf(grantsA, 1)
    assert.lengthOf(grantsB, 1)
  })

  test('assignPermissionsBatch: un permiso inválido revierte days y grants de TODOS los roles del lote', async ({
    assert,
  }) => {
    const roleService = new RoleService()

    await db.transaction(async (trx) => {
      await roleService.assignPermissions(roleA.roleId, [permission.systemPermissionId], trx)
    })

    await assert.rejects(async () => {
      await db.transaction(async (trx) => {
        await roleService.assignPermissionsBatch(
          [
            {
              roleId: roleA.roleId,
              permissions: [permission.systemPermissionId],
              roleManagementDays: 99,
            },
            {
              roleId: roleB.roleId,
              permissions: [999999999],
              roleManagementDays: 88,
            },
          ],
          trx
        )
      })
    })

    const reloadedA = await Role.query().where('role_id', roleA.roleId).firstOrFail()
    assert.equal(reloadedA.roleManagementDays, 10)

    const grantsA = await RoleSystemPermission.query().where('role_id', roleA.roleId)
    assert.lengthOf(grantsA, 1)
    assert.equal(grantsA[0].systemPermissionId, permission.systemPermissionId)

    const grantsB = await RoleSystemPermission.query().where('role_id', roleB.roleId)
    assert.lengthOf(grantsB, 0)
  })
})

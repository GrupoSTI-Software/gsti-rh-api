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

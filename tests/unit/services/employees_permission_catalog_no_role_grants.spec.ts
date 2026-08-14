import { test } from '@japa/runner'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermissionCatalogSyncService from '#services/system_permission_catalog_sync_service'

/**
 * No-regresión de roles (USRH1785766406722, Task 4, regla 10): sincronizar el
 * catálogo real de Empleados no debe conceder ni retirar accesos en
 * `role_system_permissions`.
 */

test.group('EMPLOYEES_PERMISSION_CATALOG — sync real no concede roles (Task 4)', () => {
  test('sync del catálogo real no aumenta role_system_permissions', async ({ assert }) => {
    const before = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )
    const beforeCount = before.length
    await new SystemPermissionCatalogSyncService().sync()
    const after = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )
    assert.equal(after.length, beforeCount)
  })
})

import { test } from '@japa/runner'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
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

  test('sync materializa manage-employee-supplies y no lo concede a ningún rol', async ({
    assert,
  }) => {
    const beforeGrants = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )
    const result = await new SystemPermissionCatalogSyncService().sync()
    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', 'manage-employee-supplies')
      .whereHas('systemModule', (query) =>
        query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
      )
      .first()
    assert.exists(permission)
    const afterGrants = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )
    assert.equal(afterGrants.length, beforeGrants.length)
    const granted = afterGrants.filter(
      (row) => row.systemPermissionId === permission!.systemPermissionId
    )
    assert.equal(granted.length, 0)
    void result
  })

  test('sync materializa los 15 slugs nuevos y no los concede a ningún rol', async ({
    assert,
  }) => {
    const slugs = [
      'download-employees-import-template',
      'download-shift-assignment-template',
      'download-shift-exceptions',
      'download-vacations-report',
      'download-vacations-summary',
      'download-vacation-import-template',
      'download-payroll-format',
      'download-attendance-by-employee',
      'download-attendance-by-position',
      'download-attendance-by-department',
      'download-attendance-all',
      'download-permissions-by-dates',
      'download-supplies-report',
      'download-employee-contract',
      'import-vacations',
    ]
    const beforeGrants = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )
    await new SystemPermissionCatalogSyncService().sync()
    const afterGrants = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )
    assert.equal(afterGrants.length, beforeGrants.length)

    for (const slug of slugs) {
      const permission = await SystemPermission.query()
        .whereNull('system_permission_deleted_at')
        .where('system_permission_slug', slug)
        .whereHas('systemModule', (query) =>
          query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
        )
        .first()
      assert.exists(permission, slug)
      const granted = afterGrants.filter(
        (row) => row.systemPermissionId === permission!.systemPermissionId
      )
      assert.equal(granted.length, 0, slug)
    }
  })
})

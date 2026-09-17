import { test } from '@japa/runner'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'

/**
 * No-regresión de roles (USRH1785766406722, Task 4, regla 10): los permisos del
 * catálogo real de Empleados existen en BD porque los siembra
 * `0062_system_module_seeder` (la suite corre sobre `migration:fresh --seed`), y
 * sembrarlos no los concede a ningún rol.
 */

async function findLiveEmployeesPermission(slug: string): Promise<SystemPermission | null> {
  return SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', slug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
    .first()
}

async function liveGrants(): Promise<RoleSystemPermission[]> {
  return RoleSystemPermission.query().whereNull('role_system_permission_deleted_at')
}

test.group('EMPLOYEES_PERMISSION_CATALOG — la siembra no concede roles (Task 4)', () => {
  test('el seed materializa manage-employee-supplies y no lo concede a ningún rol', async ({
    assert,
  }) => {
    const permission = await findLiveEmployeesPermission('manage-employee-supplies')
    assert.exists(permission)

    const grants = await liveGrants()
    const granted = grants.filter(
      (row) => row.systemPermissionId === permission!.systemPermissionId
    )
    assert.equal(granted.length, 0)
  })

  test('el seed materializa los 15 slugs nuevos y no los concede a ningún rol', async ({
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
    const grants = await liveGrants()

    for (const slug of slugs) {
      const permission = await findLiveEmployeesPermission(slug)
      assert.exists(permission, slug)
      const granted = grants.filter(
        (row) => row.systemPermissionId === permission!.systemPermissionId
      )
      assert.equal(granted.length, 0, slug)
    }
  })
})

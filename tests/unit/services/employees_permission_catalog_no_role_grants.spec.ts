import { test } from '@japa/runner'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'

/**
 * No-regresión de roles (USRH1785766406722, Task 4, regla 10): los permisos del
 * catálogo real de Empleados existen en BD porque los siembra
 * `0062_system_module_seeder` (la suite corre sobre `migration:fresh --seed`), y
 * sembrarlos no los concede a ningún rol.
 *
 * Con una excepción declarada, que es de otra siembra: el rol `admin` que cada
 * empresa estrena al nacer (`0064_tenant_roles_seeder`) recibe el catálogo
 * completo a propósito, porque es el administrador del cliente. Lo que este
 * spec sigue protegiendo es que materializar un permiso NO se lo reparta a
 * nadie más: ni a los roles que ya existían ni a los que un cliente creó.
 */

/** Slug del rol que sí nace con el catálogo puesto (uno por empresa). */
const TENANT_ADMIN_SLUG = 'admin'

async function findLiveEmployeesPermission(slug: string): Promise<SystemPermission | null> {
  return SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', slug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
    .first()
}

/**
 * Concesiones vivas EXCLUYENDO las del administrador que cada empresa estrena:
 * esas son la siembra de roles, no la del catálogo.
 */
async function liveGrants(): Promise<RoleSystemPermission[]> {
  const adminRoles = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', TENANT_ADMIN_SLUG)
    .select('role_id')
  const adminRoleIds = adminRoles.map((role) => role.roleId)

  const query = RoleSystemPermission.query().whereNull('role_system_permission_deleted_at')

  if (adminRoleIds.length > 0) {
    query.whereNotIn('role_id', adminRoleIds)
  }

  return query
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

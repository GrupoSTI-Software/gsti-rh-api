import { test } from '@japa/runner'
import RoleService from '#services/role_service'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import Role from '#models/role'

/**
 * Tests unitarios — RoleService.hasAccess, bypass del rol `owner` (USRH1783712837561).
 *
 * `owner` debe hacer bypass de permiso igual que `root` (AC §5): la llamada
 * retorna `true` sin necesitar filas en `role_system_permissions`, usando un
 * slug de módulo inexistente para probar que el bypass ocurre ANTES de
 * cualquier consulta a `system_modules`/`system_permissions`.
 */

async function getOwnerRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'owner').first()
  if (!role) {
    throw new Error('El rol "owner" debería existir tras correr el seeder 0006.')
  }
  return role
}

test.group('RoleService.hasAccess — bypass de owner', () => {
  test('retorna true para owner sin depender de role_system_permissions', async ({ assert }) => {
    const ownerRole = await getOwnerRole()
    const roleService = new RoleService()

    const hasAccess = await roleService.hasAccess(
      ownerRole.roleId,
      'modulo-inexistente-para-probar-bypass',
      'read'
    )

    assert.isTrue(hasAccess, 'owner debe pasar el gate central sin consultar permisos reales')
  })

  test('retorna false para un roleId inexistente', async ({ assert }) => {
    const roleService = new RoleService()
    const hasAccess = await roleService.hasAccess(999999, 'modulo-inexistente', 'read')
    assert.isFalse(hasAccess)
  })
})

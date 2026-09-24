import { test } from '@japa/runner'
import RoleService from '#services/role_service'
import { ensureRole } from '#tests/helpers/ensure_role'

/**
 * Tests unitarios — RoleService.hasAccess, bypass del rol `owner` (USRH1783712837561).
 *
 * `owner` debe hacer bypass de permiso igual que `root` (AC §5): la llamada
 * retorna `true` sin necesitar filas en `role_system_permissions`, usando un
 * slug de módulo inexistente para probar que el bypass ocurre ANTES de
 * cualquier consulta a `system_modules`/`system_permissions`.
 */

test.group('RoleService.hasAccess — bypass de owner', () => {
  test('retorna true para owner sin depender de role_system_permissions', async ({ assert }) => {
    const ownerRole = await ensureRole('owner')
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

/**
 * `owner` ve toda la plantilla de su empresa igual que pasa el gate central:
 * sin la fila `full-employee-assigned` el listado lo acotaba a los
 * colaboradores que tiene a cargo y el dueño de una empresa importada no
 * veía a nadie.
 */
test.group('RoleService.hasAccessToFullEmployees — owner', () => {
  test('retorna true para owner sin depender de role_system_permissions', async ({ assert }) => {
    const ownerRole = await ensureRole('owner')

    const hasAccess = await new RoleService().hasAccessToFullEmployees(ownerRole.roleId)

    assert.isTrue(hasAccess, 'owner debe ver toda la plantilla de su empresa')
  })

  test('retorna false para un roleId inexistente', async ({ assert }) => {
    const hasAccess = await new RoleService().hasAccessToFullEmployees(999999)
    assert.isFalse(hasAccess)
  })
})

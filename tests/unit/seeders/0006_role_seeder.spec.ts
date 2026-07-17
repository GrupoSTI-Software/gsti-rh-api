import { test } from '@japa/runner'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import Role from '#models/role'

/**
 * Tests del seeder 0006_role_seeder — rol `owner` (USRH1783712837561).
 *
 * Cubre los criterios de aceptación del spec (§5):
 *  - Existe un rol `owner` nuevo sin alterar el catálogo previo (1 super-administrador,
 *    2 rh-manager, 3 root, 4 empleado).
 *  - El seeder es idempotente: correrlo dos veces no duplica filas.
 */

const PREVIOUS_ROLES: Array<{ roleId: number; roleSlug: string }> = [
  { roleId: 1, roleSlug: 'super-administrador' },
  { roleId: 2, roleSlug: 'rh-manager' },
  { roleId: 3, roleSlug: 'root' },
  { roleId: 4, roleSlug: 'empleado' },
]

test.group('0006_role_seeder — rol owner', () => {
  test('siembra el rol owner (roleId 5) sin alterar el catálogo previo', async ({ assert }) => {
    await new RoleSeeder({} as never).run()

    const owner = await Role.query().whereNull('role_deleted_at').where('role_slug', 'owner').first()
    assert.exists(owner, 'El rol "owner" debe existir tras correr el seeder')
    assert.equal(owner!.roleId, 5)
    assert.equal(owner!.roleActive, 1)
    assert.equal(owner!.roleBusinessAccess, 'gsti-rh')

    for (const previous of PREVIOUS_ROLES) {
      const role = await Role.query()
        .whereNull('role_deleted_at')
        .where('role_id', previous.roleId)
        .first()
      assert.exists(role, `El rol previo roleId=${previous.roleId} debe seguir existiendo`)
      assert.equal(role!.roleSlug, previous.roleSlug, 'El slug del rol previo no debe cambiar')
    }
  })

  test('correr el seeder dos veces no duplica el rol owner', async ({ assert }) => {
    await new RoleSeeder({} as never).run()
    const firstRunOwners = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', 'owner')

    await new RoleSeeder({} as never).run()
    const secondRunOwners = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', 'owner')

    assert.lengthOf(firstRunOwners, 1, 'Debe existir exactamente un rol owner')
    assert.lengthOf(secondRunOwners, 1, 'Correr el seeder de nuevo no debe duplicar el rol owner')
  })
})

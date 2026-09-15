import { test } from '@japa/runner'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import Role from '#models/role'

/**
 * Tests del seeder 0006_role_seeder: siembra solo `root` (decisión de 303927d5).
 *
 * `owner`, `super-administrador`, `rh-manager` y `empleado` ya no nacen en una BD
 * limpia; los specs que los necesitan los aseguran con `tests/helpers/ensure_role.ts`.
 * Por eso ningún caso compara contra el total de la tabla `roles`: otros specs
 * de la misma corrida pueden haberlos creado antes. Se compara lo que cambia al
 * correr el seeder. Tampoco se afirma ningún id: lo asigna la BD.
 */

/** Slugs de todas las filas de `roles`, incluidas las dadas de baja. */
async function allRoleSlugs(): Promise<string[]> {
  const roles = await Role.query().withTrashed().select('role_slug')
  return roles.map((role) => role.roleSlug)
}

/** Filas vivas de `root`. */
async function liveRootRoles(): Promise<Role[]> {
  return Role.query().whereNull('role_deleted_at').where('role_slug', 'root')
}

test.group('0006_role_seeder — solo root', () => {
  test('deja un único root vivo y activo', async ({ assert }) => {
    await new RoleSeeder({} as never).run()

    const roots = await liveRootRoles()
    assert.lengthOf(roots, 1, 'Debe existir exactamente un rol root vivo tras correr el seeder')
    assert.equal(roots[0].roleActive, 1)
  })

  test('no crea ningún rol distinto de root', async ({ assert }) => {
    const before = await allRoleSlugs()

    await new RoleSeeder({} as never).run()

    const after = await allRoleSlugs()
    const created = after.filter((slug) => !before.includes(slug))
    assert.includeMembers(['root'], created, 'El seeder solo puede agregar root')
    assert.equal(after.length - before.length, created.length, 'El seeder no duplica filas existentes')
  })

  test('es idempotente: correrlo dos veces no duplica root ni cambia su id', async ({ assert }) => {
    await new RoleSeeder({} as never).run()
    const firstRun = await liveRootRoles()
    const slugsAfterFirstRun = await allRoleSlugs()

    await new RoleSeeder({} as never).run()
    const secondRun = await liveRootRoles()
    const slugsAfterSecondRun = await allRoleSlugs()

    assert.lengthOf(secondRun, 1, 'Correr el seeder de nuevo no debe duplicar root')
    assert.equal(secondRun[0].roleId, firstRun[0].roleId, 'El id de root no debe cambiar')
    assert.lengthOf(slugsAfterSecondRun, slugsAfterFirstRun.length, 'No debe aparecer ninguna fila nueva')
  })
})

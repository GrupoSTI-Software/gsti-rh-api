import { test } from '@japa/runner'
import RoleSeeder, { ROLE_SEEDS } from '#database/seeders/0006_role_seeder'
import Role from '#models/role'

/**
 * Tests del seeder 0006_role_seeder: siembra los tres roles globales que el
 * runtime resuelve por slug (`root`, `owner`, `empleado`) y ninguno más.
 *
 * Es un puente hasta que aterricen los roles por empresa. Lo que protege este
 * spec es el borde: que no vuelvan `super-administrador` ni `rh-manager`, que
 * dan salvoconducto ampliado y visibilidad sin que ningún flujo los necesite.
 *
 * Ningún caso compara contra el total de la tabla `roles`: otros specs de la
 * misma corrida crean roles con `tests/helpers/ensure_role.ts` antes de que
 * corra este seeder. Por eso lo declarado se afirma sobre `ROLE_SEEDS` y lo
 * sembrado sobre las filas de cada slug. Tampoco se afirma ningún id: lo
 * asigna la BD.
 */

const SEMBRADOS = ['root', 'owner', 'empleado'] as const
const NO_SEMBRADOS = ['super-administrador', 'rh-manager'] as const

/** Slugs de todas las filas de `roles`, incluidas las dadas de baja. */
async function allRoleSlugs(): Promise<string[]> {
  const roles = await Role.query().withTrashed().select('role_slug')
  return roles.map((role) => role.roleSlug)
}

/** Filas vivas de un slug. */
async function liveRoles(slug: string): Promise<Role[]> {
  return Role.query().whereNull('role_deleted_at').where('role_slug', slug)
}

test.group('0006_role_seeder — puente de roles globales', () => {
  test('declara root, owner y empleado, y ningún rol con salvoconducto ampliado', ({ assert }) => {
    const declarados = ROLE_SEEDS.map((role) => role.roleSlug)

    assert.deepEqual(declarados, [...SEMBRADOS])
    for (const slug of NO_SEMBRADOS) {
      assert.notInclude(
        declarados,
        slug,
        `${slug} no se siembra: reparte acceso que ningún flujo necesita para operar`
      )
    }
  })

  test('ninguna declaración fija id ni concesiones ni ata el CSV a una empresa', ({ assert }) => {
    for (const role of ROLE_SEEDS) {
      assert.notProperty(role, 'roleId', `${role.roleSlug} no debe declarar id: lo asigna la BD`)
      assert.equal(role.roleActive, 1)
      assert.equal(
        role.roleBusinessAccess,
        '',
        `${role.roleSlug} no debe atar su visibilidad al slug de una empresa`
      )
    }
  })

  test('deja una sola fila viva y activa de cada rol sembrado', async ({ assert }) => {
    await new RoleSeeder({} as never).run()

    for (const slug of SEMBRADOS) {
      const roles = await liveRoles(slug)
      assert.lengthOf(roles, 1, `Debe existir exactamente un rol ${slug} vivo tras correr el seeder`)
      assert.equal(roles[0].roleActive, 1)
    }
  })

  test('no crea ningún rol fuera de los declarados', async ({ assert }) => {
    const before = await allRoleSlugs()

    await new RoleSeeder({} as never).run()

    const after = await allRoleSlugs()
    const created = after.filter((slug) => !before.includes(slug))
    assert.includeMembers([...SEMBRADOS], created, 'El seeder solo puede agregar los declarados')
    assert.equal(
      after.length - before.length,
      created.length,
      'El seeder no duplica filas existentes'
    )
  })

  test('es idempotente: correrlo dos veces no duplica ni cambia ids', async ({ assert }) => {
    await new RoleSeeder({} as never).run()
    const idsPrimeraCorrida = new Map<string, number>()
    for (const slug of SEMBRADOS) {
      const [role] = await liveRoles(slug)
      idsPrimeraCorrida.set(slug, role.roleId)
    }
    const slugsPrimeraCorrida = await allRoleSlugs()

    await new RoleSeeder({} as never).run()
    const slugsSegundaCorrida = await allRoleSlugs()

    for (const slug of SEMBRADOS) {
      const roles = await liveRoles(slug)
      assert.lengthOf(roles, 1, `Correr el seeder de nuevo no debe duplicar ${slug}`)
      assert.equal(roles[0].roleId, idsPrimeraCorrida.get(slug), `El id de ${slug} no debe cambiar`)
    }
    assert.lengthOf(
      slugsSegundaCorrida,
      slugsPrimeraCorrida.length,
      'No debe aparecer ninguna fila nueva'
    )
  })
})

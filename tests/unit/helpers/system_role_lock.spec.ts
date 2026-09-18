import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import { isOwnRoleLockedForUser } from '#helpers/system_role_lock'

interface FakeUser {
  roleId: number
  role?: { roleSlug: string }
  load: (relation: string) => Promise<void>
}

/**
 * Sesión mínima: `isOwnRoleLockedForUser` solo usa `check()`, `user.roleId` y
 * el slug del rol (cargado o bajo demanda).
 */
function fakeAuth(user: FakeUser | null): HttpContext['auth'] {
  return {
    check: async () => user !== null,
    user,
  } as unknown as HttpContext['auth']
}

function userWithRole(roleId: number, roleSlug: string): FakeUser {
  return { roleId, role: { roleSlug }, load: async () => {} }
}

test.group('isOwnRoleLockedForUser — nadie reconfigura su propio rol salvo root y owner', () => {
  test('un rol del tenant sobre sí mismo queda bloqueado, también con el id como texto del path', async ({
    assert,
  }) => {
    const auth = fakeAuth(userWithRole(41, 'gate-admin-roles'))

    assert.isTrue(await isOwnRoleLockedForUser(auth, 41))
    assert.isTrue(await isOwnRoleLockedForUser(auth, '41'))
  })

  test('sobre otro rol no bloquea: eso lo decide el gate', async ({ assert }) => {
    const auth = fakeAuth(userWithRole(41, 'gate-admin-roles'))

    assert.isFalse(await isOwnRoleLockedForUser(auth, 42))
  })

  test('root y owner sí pueden tocar su propio rol', async ({ assert }) => {
    assert.isFalse(await isOwnRoleLockedForUser(fakeAuth(userWithRole(1, 'root')), 1))
    assert.isFalse(await isOwnRoleLockedForUser(fakeAuth(userWithRole(2, 'owner')), 2))
  })

  test('super-administrador no es excepción', async ({ assert }) => {
    assert.isTrue(await isOwnRoleLockedForUser(fakeAuth(userWithRole(3, 'super-administrador')), 3))
  })

  test('carga el rol si la sesión no lo trae', async ({ assert }) => {
    const user: FakeUser = {
      roleId: 1,
      load: async () => {
        user.role = { roleSlug: 'root' }
      },
    }

    assert.isFalse(await isOwnRoleLockedForUser(fakeAuth(user), 1))
  })

  test('sin sesión se niega', async ({ assert }) => {
    assert.isTrue(await isOwnRoleLockedForUser(fakeAuth(null), 1))
  })
})

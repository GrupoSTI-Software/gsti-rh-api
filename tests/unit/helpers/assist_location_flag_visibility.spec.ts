import { test } from '@japa/runner'
import Role from '#models/role'
import User from '#models/user'
import { PLATFORM_ROLE_SLUG } from '#constants/system_roles'
import type { TenantRoleSlug } from '#constants/tenant_provisioned_roles'
import type { SessionEmployeeOwnership } from '#helpers/session_user_owns_employee'
import {
  canSeeAssistLocationFlag,
  type AssistLocationFlagVisibilityDeps,
} from '#helpers/assist_location_flag_visibility'

/**
 * Visibilidad de la marca de ubicación en el detalle del día
 * (VLRH-H1791056345261, CA-04, CA-06, CA-07 y CA-15; SEC-1 y SEC-2).
 * Sin base de datos: la propiedad y el permiso llegan con dobles.
 */

const OWNER_ROLE_SLUG = 'owner' satisfies TenantRoleSlug
const ADMIN_ROLE_SLUG = 'admin' satisfies TenantRoleSlug

interface Spy {
  deps: AssistLocationFlagVisibilityDeps
  calls: { ownership: number; hasAccess: number }
}

function spy(
  ownership: () => Promise<SessionEmployeeOwnership>,
  hasAccess: () => Promise<boolean>
): Spy {
  const calls = { ownership: 0, hasAccess: 0 }
  return {
    calls,
    deps: {
      ownership: () => {
        calls.ownership += 1
        return ownership()
      },
      hasAccess: () => {
        calls.hasAccess += 1
        return hasAccess()
      },
    },
  }
}

const granted = () =>
  spy(
    async () => 'none',
    async () => true
  )

function sessionUser(roleSlug: string | null, isPlatformAdmin = false): User {
  const user = new User()
  user.userId = 10
  user.roleId = 9
  user.personId = 428
  user.isPlatformAdmin = isPlatformAdmin
  if (roleSlug !== null) {
    const role = new Role()
    role.roleId = 9
    role.roleSlug = roleSlug
    user.$setRelated('role', role)
  }
  return user
}

test.group('canSeeAssistLocationFlag', () => {
  test('con read del monitor y sin ser el empleado, la ve', async ({ assert }) => {
    const double = granted()
    assert.isTrue(await canSeeAssistLocationFlag(sessionUser(ADMIN_ROLE_SLUG), '413', double.deps))
    assert.deepEqual(double.calls, { ownership: 1, hasAccess: 1 })
  })

  test('el dueño la ve: hasAccess le responde true por el atajo', async ({ assert }) => {
    assert.isTrue(await canSeeAssistLocationFlag(sessionUser(OWNER_ROLE_SLUG), 413, granted().deps))
  })

  test('sin la concesión no la ve', async ({ assert }) => {
    const double = spy(
      async () => 'none',
      async () => false
    )
    assert.isFalse(await canSeeAssistLocationFlag(sessionUser(ADMIN_ROLE_SLUG), 413, double.deps))
  })

  test('sin usuario no la ve', async ({ assert }) => {
    const double = granted()
    assert.isFalse(await canSeeAssistLocationFlag(undefined, 413, double.deps))
    assert.deepEqual(double.calls, { ownership: 0, hasAccess: 0 })
  })

  test('id de empleado no entero estricto: {value}')
    .with([
      { value: '12abc' },
      { value: '0' },
      { value: '-3' },
      { value: '' },
      { value: '1.5' },
      { value: ['413'] },
      { value: null },
    ])
    .run(async ({ assert }, row) => {
      const double = granted()
      assert.isFalse(
        await canSeeAssistLocationFlag(sessionUser(ADMIN_ROLE_SLUG), row.value, double.deps)
      )
      assert.deepEqual(double.calls, { ownership: 0, hasAccess: 0 })
    })

  test('el propio empleado no la ve, activo o dado de baja: {ownership}')
    .with([{ ownership: 'active' as const }, { ownership: 'terminated' as const }])
    .run(async ({ assert }, row) => {
      const double = spy(
        async () => row.ownership,
        async () => true
      )
      assert.isFalse(await canSeeAssistLocationFlag(sessionUser(ADMIN_ROLE_SLUG), 413, double.deps))
      assert.equal(double.calls.hasAccess, 0)
    })

  test('cuenta de plataforma: no la ve y el corte va antes de consultar', async ({ assert }) => {
    const double = granted()
    assert.isFalse(
      await canSeeAssistLocationFlag(sessionUser(ADMIN_ROLE_SLUG, true), 413, double.deps)
    )
    assert.deepEqual(double.calls, { ownership: 0, hasAccess: 0 })
  })

  test('cuenta de plataforma con el 1 que entrega la BD: no la ve', async ({ assert }) => {
    // MySQL entrega `is_platform_admin` como 0/1, no como booleano.
    const user = Object.assign(sessionUser(ADMIN_ROLE_SLUG), { isPlatformAdmin: 1 })
    const double = granted()
    assert.isFalse(await canSeeAssistLocationFlag(user, 413, double.deps))
    assert.deepEqual(double.calls, { ownership: 0, hasAccess: 0 })
  })

  test('rol efectivo root: no la ve y el corte va antes de consultar', async ({ assert }) => {
    const double = granted()
    assert.isFalse(
      await canSeeAssistLocationFlag(sessionUser(PLATFORM_ROLE_SLUG), 413, double.deps)
    )
    assert.deepEqual(double.calls, { ownership: 0, hasAccess: 0 })
  })

  test('rol sin cargar: no la ve', async ({ assert }) => {
    const double = granted()
    assert.isFalse(await canSeeAssistLocationFlag(sessionUser(null), 413, double.deps))
    assert.deepEqual(double.calls, { ownership: 0, hasAccess: 0 })
  })

  test('una excepción equivale a no visible: {where}')
    .with([{ where: 'ownership' }, { where: 'hasAccess' }])
    .run(async ({ assert }, row) => {
      const boom = async (): Promise<never> => {
        throw new Error('fallo de prueba')
      }
      const double =
        row.where === 'ownership' ? spy(boom, async () => true) : spy(async () => 'none', boom)
      assert.isFalse(await canSeeAssistLocationFlag(sessionUser(ADMIN_ROLE_SLUG), 413, double.deps))
    })
})

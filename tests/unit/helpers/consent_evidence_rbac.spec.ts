import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import { assertConsentEvidenceAccess } from '#helpers/consent_evidence_rbac'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import Role from '#models/role'
import Person from '#models/person'
import User from '#models/user'

/**
 * Tests unitarios — assertConsentEvidenceAccess, regresión de aislamiento entre
 * tenants (USRH1783712837561, regla central: "el dueño... nunca ve otra empresa").
 *
 * Esta reserva es GLOBAL entre empresas y exclusiva de `root` (USRH1783368377327,
 * regla 1). El bypass de permiso agregado para `owner` en el gate central
 * (`role_service.ts:118`) y en `compliance_repse_rbac.ts` NO debe filtrarse aquí:
 * `owner` debe seguir recibiendo 403, exactamente igual que `super-administrador`.
 */

async function ensureRole(slug: string): Promise<Role> {
  if (slug === 'owner') {
    await new RoleSeeder({} as never).run()
  }
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', slug).first()
  if (!role) {
    throw new Error(`El rol "${slug}" es requerido para este test. Ejecuta los seeders primero.`)
  }
  return role
}

async function createUserWithRole(role: Role): Promise<{ user: User; person: Person }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const person = new Person()
  person.personFirstname = 'ConsentEvidenceRbac'
  person.personLastname = 'Test'
  person.personSecondLastname = stamp
  person.personEmail = `consent-evidence-rbac-${stamp}@gsti-tests.local`
  await person.save()

  const user = new User()
  user.userEmail = `consent-evidence-rbac-${stamp}@gsti-tests.local`
  user.userPassword = 'ConsentEvidenceRbacTest123!'
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

async function cleanup(user: User, person: Person) {
  await User.query().where('user_id', user.userId).delete()
  await Person.query().where('person_id', person.personId).delete()
}

function buildCtxStub(user: User): { ctx: HttpContext; getStatus: () => number | null } {
  let statusCode: number | null = null
  const ctx = {
    auth: { user },
    i18n: {
      t: (_key: string, _params: unknown, fallback: string) => fallback,
    },
    response: {
      status(code: number) {
        statusCode = code
        return this
      },
      json() {
        return this
      },
    },
  } as unknown as HttpContext

  return { ctx, getStatus: () => statusCode }
}

const FORBIDDEN = { errorCode: 'CONSENT.EVIDENCE.TEST.001', i18nPrefix: 'consent_evidence' }

test.group('assertConsentEvidenceAccess — reserva exclusiva de root', () => {
  test('owner recibe 403: la reserva global NO se filtra por el bypass de owner', async ({
    assert,
  }) => {
    const ownerRole = await ensureRole('owner')
    const { user, person } = await createUserWithRole(ownerRole)

    try {
      const { ctx, getStatus } = buildCtxStub(user)
      const allowed = await assertConsentEvidenceAccess(ctx, 'read', FORBIDDEN)

      assert.isFalse(allowed, 'owner NUNCA debe acceder a la evidencia global de consentimiento')
      assert.equal(getStatus(), 403)
    } finally {
      await cleanup(user, person)
    }
  })

  test('super-administrador sigue recibiendo 403 (invariante preexistente)', async ({ assert }) => {
    const superAdminRole = await ensureRole('super-administrador')
    const { user, person } = await createUserWithRole(superAdminRole)

    try {
      const { ctx, getStatus } = buildCtxStub(user)
      const allowed = await assertConsentEvidenceAccess(ctx, 'read', FORBIDDEN)

      assert.isFalse(allowed)
      assert.equal(getStatus(), 403)
    } finally {
      await cleanup(user, person)
    }
  })

  test('root sigue pasando (invariante preexistente)', async ({ assert }) => {
    const rootRole = await ensureRole('root')
    const { user, person } = await createUserWithRole(rootRole)

    try {
      const { ctx } = buildCtxStub(user)
      const allowed = await assertConsentEvidenceAccess(ctx, 'read', FORBIDDEN)

      assert.isTrue(allowed, 'root debe seguir pasando esta reserva')
    } finally {
      await cleanup(user, person)
    }
  })
})

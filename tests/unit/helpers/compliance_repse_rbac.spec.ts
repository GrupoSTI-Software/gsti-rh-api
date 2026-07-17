import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import { assertComplianceRepsePermission } from '#helpers/compliance_repse_rbac'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import Role from '#models/role'
import Person from '#models/person'
import User from '#models/user'

/**
 * Tests unitarios — assertComplianceRepsePermission, bypass de `owner`
 * (USRH1783712837561, regresión de acceso: owner ≥ super-administrador actual).
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
  person.personFirstname = 'ComplianceRbac'
  person.personLastname = 'Test'
  person.personSecondLastname = stamp
  person.personEmail = `compliance-rbac-${stamp}@gsti-tests.local`
  await person.save()

  const user = new User()
  user.userEmail = `compliance-rbac-${stamp}@gsti-tests.local`
  user.userPassword = 'ComplianceRbacTest123!'
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

function buildCtxStub(user: User): HttpContext {
  return {
    auth: { user },
    i18n: {
      t: (_key: string, _params: unknown, fallback: string) => fallback,
    },
    response: {
      status() {
        return this
      },
      json() {
        return this
      },
    },
  } as unknown as HttpContext
}

const FORBIDDEN = { errorCode: 'REPSE.PERM.TEST.001', i18nPrefix: 'repse_registration' }

test.group('assertComplianceRepsePermission — bypass de owner', () => {
  test('owner pasa igual que super-administrador (sin permisos reales)', async ({ assert }) => {
    const ownerRole = await ensureRole('owner')
    const superAdminRole = await ensureRole('super-administrador')

    const { user: ownerUser, person: ownerPerson } = await createUserWithRole(ownerRole)
    const { user: superAdminUser, person: superAdminPerson } = await createUserWithRole(
      superAdminRole
    )

    try {
      const ownerAllowed = await assertComplianceRepsePermission(
        buildCtxStub(ownerUser),
        'repse-registrations',
        'read',
        FORBIDDEN
      )
      const superAdminAllowed = await assertComplianceRepsePermission(
        buildCtxStub(superAdminUser),
        'repse-registrations',
        'read',
        FORBIDDEN
      )

      assert.isTrue(ownerAllowed, 'owner debe pasar el bypass de compliance-repse')
      assert.isTrue(superAdminAllowed, 'super-administrador debe seguir pasando (comportamiento previo)')
    } finally {
      await cleanup(ownerUser, ownerPerson)
      await cleanup(superAdminUser, superAdminPerson)
    }
  })
})

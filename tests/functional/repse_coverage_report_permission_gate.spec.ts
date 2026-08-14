import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'

const TEST_PASSWORD = 'RepseCoverageGateTest123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function findRole(slug: string): Promise<Role> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', slug).first()
  if (!role) {
    throw new Error(`Se requiere el rol "${slug}" en BD para este test.`)
  }
  return role
}

async function ensureRhManagerRole(): Promise<Role> {
  return findRole('rh-manager')
}

async function createActor(emailPrefix: string, role: Role): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'RepseCoverageGate'
  person.personLastname = 'Test'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Repse Coverage Gate ${stamp}`
  businessUnit.businessUnitSlug = `repse-coverage-gate-${stamp}`
  businessUnit.businessUnitLegalName = `Repse Coverage Gate Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'platform'
  await businessUnit.save()

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  return { user, person, businessUnit }
}

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

test.group('GET /api/repse/coverage-report — PermissionGateMiddleware (piloto USRH1785766406721)', () => {
  test('root tiene acceso (bypass expanded)', async ({ client }) => {
    const actor = await createActor('repse-gate-root', await findRole('root'))
    try {
      const response = await client
        .get('/api/repse/coverage-report')
        .qs({ from: '2026-01-01', to: '2026-01-02' })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
    } finally {
      await cleanupActor(actor)
    }
  })

  test('owner tiene acceso (bypass expanded)', async ({ client }) => {
    const actor = await createActor('repse-gate-owner', await findRole('owner'))
    try {
      const response = await client
        .get('/api/repse/coverage-report')
        .qs({ from: '2026-01-01', to: '2026-01-02' })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
    } finally {
      await cleanupActor(actor)
    }
  })

  test('super-administrador tiene acceso (bypass expanded)', async ({ client }) => {
    const actor = await createActor('repse-gate-dg', await findRole('super-administrador'))
    try {
      const response = await client
        .get('/api/repse/coverage-report')
        .qs({ from: '2026-01-01', to: '2026-01-02' })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(200)
    } finally {
      await cleanupActor(actor)
    }
  })

  test('rol sin privilegio es rechazado (module compliance-contratos no existe ⇒ fail-closed, sin permiso)', async ({
    client,
  }) => {
    const actor = await createActor('repse-gate-plain', await ensureRhManagerRole())
    try {
      const response = await client
        .get('/api/repse/coverage-report')
        .qs({ from: '2026-01-01', to: '2026-01-02' })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(403)
      response.assertBodyContains({ key: 'PERM.DENIED' })
    } finally {
      await cleanupActor(actor)
    }
  })

  test('export sigue el mismo contrato de permisos que el listado', async ({ client }) => {
    const actor = await createActor('repse-gate-export-plain', await ensureRhManagerRole())
    try {
      const response = await client
        .get('/api/repse/coverage-report/export')
        .qs({ from: '2026-01-01', to: '2026-01-02' })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)

      response.assertStatus(403)
      response.assertBodyContains({ key: 'PERM.DENIED' })
    } finally {
      await cleanupActor(actor)
    }
  })
})

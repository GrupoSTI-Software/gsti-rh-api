import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import ApiToken from '#models/api_token'

/**
 * USRH1790275500921 — bypass único de plataforma vía platformAdmin middleware.
 *
 * CA-5: token de consola (`origin = 'platform'`) pasa el guard.
 * CA-6: admin con token BO/app (`loginAs`) recibe 403 AUTH.PLATFORM.FORBIDDEN.
 * CA-7: la consola puede leer tenants de todas las empresas (sin businessScope).
 */

const TEST_PASSWORD = 'PlatformScopeBypass123!'
const PLATFORM_ROUTE = '/api/platform/system-modules'
const TENANTS_ROUTE = '/api/platform/tenants'

interface TestActor {
  user: User
  person: Person
}

async function createPlatformAdmin(emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'PlatformScope',
    personLastname: 'Bypass',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })

  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin: true,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  return { user, person }
}

async function cleanupActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await ApiToken.query().where('tokenable_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function loginPlatformConsole(
  client: { post: (url: string) => { json: (body: Record<string, unknown>) => Promise<{ assertStatus: (code: number) => void; body: () => { data?: { token?: string } } }> } },
  email: string
): Promise<string> {
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: email,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = response.body().data?.token
  if (!token) {
    throw new Error('Login de plataforma no devolvió token')
  }
  return token
}

test.group('PlatformAdmin — token origin (CA-5, CA-6)', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createPlatformAdmin('scope-bypass-admin')
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  test('CA-6 — isPlatformAdmin con loginAs (token web) recibe 403', async ({ client, assert }) => {
    const response = await client.get(PLATFORM_ROUTE).loginAs(admin!.user)

    response.assertStatus(403)
    assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.isUndefined(response.body().code)
  })

  test('CA-5 — login de consola emite token platform y pasa el guard', async ({ client, assert }) => {
    const token = await loginPlatformConsole(client, admin!.user.userEmail)
    const response = await client
      .get(PLATFORM_ROUTE)
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
  })
})

test.group('PlatformAdmin — bypass cross-tenant (CA-7)', (group) => {
  let admin: TestActor | null = null
  let stamp = ''
  let tenantIds: number[] = []

  group.setup(async () => {
    admin = await createPlatformAdmin('scope-bypass-tenant')
    stamp = `${Date.now()}`

    const alpha = await BusinessUnit.create({
      businessUnitName: `ScopeBypass Alpha ${stamp}`,
      businessUnitSlug: `scope-bypass-alpha-${stamp}`,
      businessUnitLegalName: `ScopeBypass Alpha ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    const beta = await BusinessUnit.create({
      businessUnitName: `ScopeBypass Beta ${stamp}`,
      businessUnitSlug: `scope-bypass-beta-${stamp}`,
      businessUnitLegalName: `ScopeBypass Beta ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    tenantIds = [alpha.businessUnitId, beta.businessUnitId]
  })

  group.teardown(async () => {
    if (tenantIds.length > 0) {
      await BusinessUnit.query().whereIn('business_unit_id', tenantIds).delete()
    }
    await cleanupActor(admin)
  })

  test('CA-7 — token platform lista tenants de más de una empresa', async ({ client, assert }) => {
    const token = await loginPlatformConsole(client, admin!.user.userEmail)
    const response = await client
      .get(TENANTS_ROUTE)
      .qs({ search: stamp })
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)

    const names = (response.body().data as Array<{ businessUnitName: string }>).map(
      (row) => row.businessUnitName
    )

    assert.include(names, `ScopeBypass Alpha ${stamp}`)
    assert.include(names, `ScopeBypass Beta ${stamp}`)
  })
})

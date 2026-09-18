import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'

/**
 * Tests funcionales — guard de `GET /api/platform/metrics/tenants/:publicId/trial`
 * (USRH1789079078169).
 *
 * Table-driven con conteo: si se agrega una ruta al grupo y no se agrega a
 * esta tabla, el spec falla por conteo. Molde:
 * `tests/functional/platform_alliance_guard.spec.ts:18, 81-94, 134-138`.
 */

const TEST_PASSWORD = 'TrialGuardTest123!'
const TRIAL_AREA_ROUTE_COUNT = 1

type TrialHttpMethod = 'get'

const TRIAL_AREA_ROUTES: Array<{ method: TrialHttpMethod; path: string }> = [
  { method: 'get', path: '/api/platform/metrics/tenants/no-existe-00000/trial' },
]

interface TestActor {
  user: User
  person: Person
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Trial',
    personLastname: 'Guard',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  return { user, person }
}

async function cleanupActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

test.group('Guard /api/platform/metrics/tenants/*/trial — conteo del área', () => {
  test('el área declara exactamente 1 ruta de prueba de tenants', ({ assert }) => {
    assert.equal(TRIAL_AREA_ROUTES.length, TRIAL_AREA_ROUTE_COUNT)
  })

  test('las rutas del archivo coinciden en número con la tabla del guard', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/platform_trial_routes.ts'), 'utf8')
    const declared = content.match(/router\.(get|post|patch|put|delete)\(/g) ?? []
    assert.equal(declared.length, TRIAL_AREA_ROUTES.length)
  })
})

test.group('Guard /api/platform/metrics/tenants/*/trial — 401 sin token', () => {
  for (const route of TRIAL_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} sin token responde 401`, async ({ client }) => {
      const response = await client[route.method](route.path)
      response.assertStatus(401)
    })
  }
})

test.group('Guard /api/platform/metrics/tenants/*/trial — 403 sin is_platform_admin', (group) => {
  let outsider: TestActor | null = null

  group.setup(async () => {
    outsider = await createActor('trial-guard-outsider', false)
  })

  group.teardown(async () => {
    await cleanupActor(outsider)
  })

  for (const route of TRIAL_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} sin permiso responde 403 sin code`, async ({
      client,
      assert,
    }) => {
      const response = await client[route.method](route.path).loginAs(outsider!.user)
      response.assertStatus(403)
      assert.isUndefined(response.body().code)
    })
  }
})

test.group('Guard /api/platform/metrics/tenants/*/trial — 200/404 con is_platform_admin', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('trial-guard-admin', true)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  for (const route of TRIAL_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} con permiso pasa el guard (no 401/403)`, async ({
      client,
      assert,
    }) => {
      const response = await client[route.method](route.path).loginAs(admin!.user)
      assert.notEqual(response.status(), 401)
      assert.notEqual(response.status(), 403)
    })
  }
})

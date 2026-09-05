import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'

/**
 * Tests funcionales — guard de `/api/platform/alliances` (USRH1788505941892).
 *
 * Table-driven con conteo: si se agrega un endpoint al grupo y no se agrega
 * a esta tabla, el spec falla por conteo. Las HUs 02, 03a y 03b extienden
 * esta misma tabla.
 */

const TEST_PASSWORD = 'AllianceGuardTest123!'
const ALLIANCE_AREA_ROUTE_COUNT = 8

type AllianceHttpMethod = 'get' | 'post' | 'patch' | 'put'

const ALLIANCE_AREA_ROUTES: Array<{ method: AllianceHttpMethod; path: string }> = [
  { method: 'get', path: '/api/platform/alliances' },
  { method: 'post', path: '/api/platform/alliances' },
  { method: 'get', path: '/api/platform/alliances/1' },
  { method: 'patch', path: '/api/platform/alliances/1' },
  { method: 'post', path: '/api/platform/alliances/1/activate' },
  { method: 'post', path: '/api/platform/alliances/1/deactivate' },
  { method: 'get', path: '/api/platform/alliances/1/billing-profile' },
  { method: 'put', path: '/api/platform/alliances/1/billing-profile' },
]

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Alliance',
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
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Alliance Guard BU ${stamp}`,
    businessUnitSlug: `alliance-guard-bu-${stamp}`,
    businessUnitLegalName: `Alliance Guard Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

test.group('Guard /api/platform/alliances — conteo del área', () => {
  test('el área declara exactamente 8 rutas de alianzas', ({ assert }) => {
    assert.equal(ALLIANCE_AREA_ROUTES.length, ALLIANCE_AREA_ROUTE_COUNT)
  })

  test('las rutas del archivo coinciden en número con la tabla del guard', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/platform_alliance_routes.ts'),
      'utf8'
    )
    const declared = content.match(/router\.(get|post|patch|put|delete)\(/g) ?? []
    assert.equal(declared.length, ALLIANCE_AREA_ROUTES.length)
  })
})

test.group('Guard /api/platform/alliances — 401 sin token', () => {
  for (const route of ALLIANCE_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} sin token responde 401`, async ({
      client,
    }) => {
      const response = await client[route.method](route.path)
      response.assertStatus(401)
    })
  }
})

test.group('Guard /api/platform/alliances — 403 sin platformAdmin', (group) => {
  let tenant: TestActor | null = null

  group.setup(async () => {
    tenant = await createActor('alliance-guard-tenant', false)
  })

  group.teardown(async () => {
    await cleanupActor(tenant)
  })

  for (const route of ALLIANCE_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} responde 403 sin datos de alianza`, async ({
      client,
      assert,
    }) => {
      const request = client[route.method](route.path).loginAs(tenant!.user)
      if (route.method === 'post' || route.method === 'patch' || route.method === 'put') {
        request.json({
          allianceName: 'No debe persistir',
          allianceDefaultCommissionPercent: 10,
          legalName: 'No debe persistir',
        })
      }

      const response = await request
      response.assertStatus(403)
      assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
      assert.isUndefined(response.body().code)
      assert.isUndefined(response.body().data)
      assert.notProperty(response.body(), 'allianceName')
      assert.notProperty(response.body(), 'allianceDefaultCommissionPercent')
    })
  }
})

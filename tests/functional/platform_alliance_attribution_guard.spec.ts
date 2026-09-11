import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'

/**
 * Guard de atribuciones (USRH1789099318034). Table-driven: si se agrega
 * un endpoint al grupo y no a esta tabla, el spec falla por conteo.
 * El contrato declara tres operaciones (alta, consulta por id, histórico).
 */

const TEST_PASSWORD = 'AllianceAttributionGuard123!'
const ATTRIBUTION_AREA_ROUTE_COUNT = 3
const SAMPLE_PUBLIC_ID = '00000000-0000-4000-8000-000000000001'

type AttributionHttpMethod = 'get' | 'post'

const ATTRIBUTION_AREA_ROUTES: Array<{ method: AttributionHttpMethod; path: string }> = [
  { method: 'post', path: '/api/platform/alliance-attributions' },
  { method: 'get', path: '/api/platform/alliance-attributions/1' },
  {
    method: 'get',
    path: `/api/platform/tenants/${SAMPLE_PUBLIC_ID}/alliance-attributions`,
  },
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
    personFirstname: 'Attribution',
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
    businessUnitName: `Attribution Guard BU ${stamp}`,
    businessUnitSlug: `attribution-guard-bu-${stamp}`,
    businessUnitLegalName: `Attribution Guard Legal ${stamp}`,
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

test.group('Guard /api/platform/alliance-attributions — conteo', () => {
  test('el área declara exactamente 3 rutas de atribución', ({ assert }) => {
    assert.equal(ATTRIBUTION_AREA_ROUTES.length, ATTRIBUTION_AREA_ROUTE_COUNT)
  })

  test('las rutas del archivo coinciden en número con la tabla del guard', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/platform_alliance_attribution_routes.ts'),
      'utf8'
    )
    const declared = content.match(/router\.(get|post|patch|put|delete)\(/g) ?? []
    assert.equal(declared.length, ATTRIBUTION_AREA_ROUTES.length)
  })
})

test.group('Guard /api/platform/alliance-attributions — 401 sin token', () => {
  for (const route of ATTRIBUTION_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} sin token responde 401`, async ({
      client,
    }) => {
      const response = await client[route.method](route.path)
      response.assertStatus(401)
    })
  }
})

test.group('Guard /api/platform/alliance-attributions — 403 sin platformAdmin', (group) => {
  let tenant: TestActor | null = null

  group.setup(async () => {
    tenant = await createActor('attribution-guard-tenant', false)
  })

  group.teardown(async () => {
    await cleanupActor(tenant)
  })

  for (const route of ATTRIBUTION_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} responde 403 sin code`, async ({
      client,
      assert,
    }) => {
      const request = client[route.method](route.path).loginAs(tenant!.user)
      if (route.method === 'post') {
        request.json({
          allianceId: 1,
          businessUnitPublicId: SAMPLE_PUBLIC_ID,
          allianceAttributionStartsAt: '2026-01-01',
        })
      }

      const response = await request
      response.assertStatus(403)
      assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
      assert.isUndefined(response.body().code)
      assert.notProperty(response.body(), 'allianceAttributionId')
    })
  }
})

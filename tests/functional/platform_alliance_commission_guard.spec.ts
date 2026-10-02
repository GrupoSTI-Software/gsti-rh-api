import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'

/**
 * Guard de comisiones devengadas de alianza (USRH1789529505468). Archivo
 * nuevo: arranca en una ruta (CA-13), no "sube en uno" como el de
 * atribuciones.
 */

const TEST_PASSWORD = 'AllianceCommissionGuard123!'
const COMMISSION_AREA_ROUTE_COUNT = 1

type CommissionHttpMethod = 'get'

const COMMISSION_AREA_ROUTES: Array<{ method: CommissionHttpMethod; path: string }> = [
  { method: 'get', path: '/api/platform/alliances/1/commissions' },
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
    personFirstname: 'Commission',
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
    businessUnitName: `Commission Guard BU ${stamp}`,
    businessUnitSlug: `commission-guard-bu-${stamp}`,
    businessUnitLegalName: `Commission Guard Legal ${stamp}`,
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

test.group('Guard /api/platform/alliances/:allianceId/commissions — conteo', () => {
  test('el área declara exactamente 1 ruta de comisiones', ({ assert }) => {
    assert.equal(COMMISSION_AREA_ROUTES.length, COMMISSION_AREA_ROUTE_COUNT)
  })

  test('las rutas del archivo coinciden en número con la tabla del guard', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/platform_alliance_commission_routes.ts'),
      'utf8'
    )
    const declared = content.match(/router\.(get|post|patch|put|delete)\(/g) ?? []
    assert.equal(declared.length, COMMISSION_AREA_ROUTES.length)
  })
})

test.group('Guard /api/platform/alliances/:allianceId/commissions — 401 sin token', () => {
  for (const route of COMMISSION_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} sin token responde 401`, async ({
      client,
    }) => {
      const response = await client[route.method](route.path)
      response.assertStatus(401)
    })
  }
})

test.group('Guard /api/platform/alliances/:allianceId/commissions — 403 sin platformAdmin', (group) => {
  let tenant: TestActor | null = null

  group.setup(async () => {
    tenant = await createActor('commission-guard-tenant', false)
  })

  group.teardown(async () => {
    await cleanupActor(tenant)
  })

  for (const route of COMMISSION_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} responde 403 sin code`, async ({
      client,
      assert,
    }) => {
      const response = await client[route.method](route.path).loginAs(tenant!.user)
      response.assertStatus(403)
      assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
      assert.isUndefined(response.body().code)
      assert.notProperty(response.body(), 'allianceCommissionId')
    })
  }
})

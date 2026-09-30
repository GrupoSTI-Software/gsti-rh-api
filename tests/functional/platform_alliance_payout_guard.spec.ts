import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import AlliancePayout from '#models/alliance_payout'

/**
 * Guard de liquidaciones de alianza (USRH1787719056820 · CA-15). Archivo
 * nuevo: cuenta las rutas de su propio archivo, no el de comisiones ni el
 * de alianzas.
 */

const TEST_PASSWORD = 'AlliancePayoutGuard123!'
const PAYOUT_AREA_ROUTE_COUNT = 4

type PayoutHttpMethod = 'get' | 'post'

const PAYOUT_AREA_ROUTES: Array<{ method: PayoutHttpMethod; path: string }> = [
  { method: 'post', path: '/api/platform/alliances/1/payouts' },
  { method: 'get', path: '/api/platform/alliances/1/payouts' },
  { method: 'get', path: '/api/platform/alliance-payouts/1' },
  { method: 'post', path: '/api/platform/alliance-payouts/1/annul' },
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
    personFirstname: 'Payout',
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
    businessUnitName: `Payout Guard BU ${stamp}`,
    businessUnitSlug: `payout-guard-bu-${stamp}`,
    businessUnitLegalName: `Payout Guard Legal ${stamp}`,
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

test.group('Guard /api/platform/alliances/:allianceId/payouts — conteo', () => {
  test('el área declara exactamente 1 ruta de liquidaciones', ({ assert }) => {
    assert.equal(PAYOUT_AREA_ROUTES.length, PAYOUT_AREA_ROUTE_COUNT)
  })

  test('las rutas del archivo coinciden en número con la tabla del guard', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/platform_alliance_payout_routes.ts'),
      'utf8'
    )
    const declared = content.match(/router\.(get|post|patch|put|delete)\(/g) ?? []
    assert.equal(declared.length, PAYOUT_AREA_ROUTES.length)
  })
})

test.group('Guard /api/platform/alliances/:allianceId/payouts — 401 sin token', () => {
  for (const route of PAYOUT_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} sin token responde 401`, async ({
      client,
    }) => {
      const response = await client[route.method](route.path)
      response.assertStatus(401)
    })
  }
})

test.group('Guard /api/platform/alliances/:allianceId/payouts — 403 sin platformAdmin', (group) => {
  let tenant: TestActor | null = null

  group.setup(async () => {
    tenant = await createActor('payout-guard-tenant', false)
  })

  group.teardown(async () => {
    await cleanupActor(tenant)
  })

  for (const route of PAYOUT_AREA_ROUTES) {
    test(`${route.method.toUpperCase()} ${route.path} responde 403 sin code y sin escribir`, async ({
      client,
      assert,
    }) => {
      const beforePayouts = await AlliancePayout.query().count('* as total')
      const response = await client[route.method](route.path)
        .json({ commissionIds: [1], paidOn: '2026-01-01', reference: 'SPEI 0123456789' })
        .loginAs(tenant!.user)
      response.assertStatus(403)
      assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
      assert.isUndefined(response.body().code)
      assert.isUndefined(response.body().data)
      assert.notProperty(response.body(), 'alliancePayoutReference')
      assert.notProperty(response.body(), 'alliancePayoutAnnulmentReason')
      assert.notProperty(response.body(), 'allianceCommissionAmountCents')

      const afterPayouts = await AlliancePayout.query().count('* as total')
      assert.equal(Number(beforePayouts[0].$extras.total), Number(afterPayouts[0].$extras.total))
    })
  }
})

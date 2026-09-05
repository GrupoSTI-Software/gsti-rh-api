import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'

/**
 * USRH1788505941895 — la relación alianza↔código no se filtra a
 * superficies de tenant.
 */

const TEST_PASSWORD = 'TenantNoAllianceLeak123!'

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createTenantActor(): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `tenant-no-alliance-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Tenant',
    personLastname: 'Leak',
    personSecondLastname: 'Alliance',
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin: false,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Tenant leak BU ${stamp}`,
    businessUnitSlug: `tenant-leak-bu-${stamp}`,
    businessUnitLegalName: `Tenant leak Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

test.group('GET /api/billing/subscription/me — no-fuga de alianza', (group) => {
  let tenant: TestActor | null = null

  group.setup(async () => {
    tenant = await createTenantActor()
  })

  group.teardown(async () => {
    if (!tenant) return
    await tenant.user.related('businessUnits').detach([tenant.businessUnit.businessUnitId])
    await User.query().where('user_id', tenant.user.userId).delete()
    await Person.query().where('person_id', tenant.person.personId).delete()
    await BusinessUnit.query().where('business_unit_id', tenant.businessUnit.businessUnitId).delete()
  })

  test('la respuesta no contiene allianceId ni discountCodeAllianceId', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/billing/subscription/me')
      .loginAs(tenant!.user)
      .header('X-Business-Unit-Id', tenant!.businessUnit.businessUnitPublicId)

    assert.isAtLeast(response.status(), 200)
    assert.isBelow(response.status(), 500)
    const raw = JSON.stringify(response.body())
    assert.notInclude(raw, 'allianceId')
    assert.notInclude(raw, 'discountCodeAllianceId')
    assert.notInclude(raw, 'alliance_qr_storage_key')
    assert.notInclude(raw, 'allianceQrStorageKey')
  })
})

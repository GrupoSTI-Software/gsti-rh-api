import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import TenantBillingProfile from '#models/tenant_billing_profile'
import { blindIndex } from '#utils/blind_index'
import { computeRfcCheckDigit } from '../../app/shared/validators/rfc.validator.js'
import { ensureRole } from '#tests/helpers/ensure_role'

/**
 * USRH1788551528001 — candado de serialización del RFC del perfil fiscal del tenant.
 * CA-1, CA-3 y CA-6.
 */

const TEST_PASSWORD = 'TenantBillingRfcSerial123!'
const PROFILE_URL = '/api/billing/profile'
const INVALID_CIPHERTEXT = 'texto-plano-no-cifrado-usrh1788551528001'

function buildValidRfc(): string {
  const base = 'ABC85010100'
  return `${base}${computeRfcCheckDigit(base)}`
}

interface OwnerFixture {
  user: User
  person: Person
  businessUnit: BusinessUnit
  profile: TenantBillingProfile
  rfc: string
}

async function createOwnerWithProfile(): Promise<OwnerFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `tbp-rfc-serial-${stamp}@gsti-tests.local`
  const rfc = buildValidRfc()
  const role = await ensureRole('owner')

  const person = await Person.create({
    personFirstname: 'TenantBilling',
    personLastname: 'RfcSerial',
    personSecondLastname: 'Owner',
    personEmail: email,
  })

  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  const businessUnit = await BusinessUnit.create({
    businessUnitName: `TBP RFC serial ${stamp}`,
    businessUnitSlug: `tbp-rfc-serial-${stamp}`,
    businessUnitLegalName: `TBP RFC serial legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'self_service',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])

  const profile = await TenantBillingProfile.create({
    businessUnitId: businessUnit.businessUnitId,
    rfc,
    rfcHash: blindIndex(rfc),
    legalName: 'TBP RFC Serial SA de CV',
    postalCode: '06600',
    taxRegimeCode: '601',
    cfdiUseCode: 'G03',
    billingEmail: 'facturas-tbp@gsti-tests.local',
  })

  return { user, person, businessUnit, profile, rfc }
}

test.group('TenantBillingProfile.rfc — serialización (USRH1788551528001)', (group) => {
  let fixture: OwnerFixture | null = null

  group.setup(async () => {
    fixture = await createOwnerWithProfile()
  })

  group.teardown(async () => {
    if (!fixture) return

    await TenantBillingProfile.query()
      .where('tenant_billing_profile_id', fixture.profile.tenantBillingProfileId)
      .delete()
    await fixture.user.related('businessUnits').detach()
    await User.query().where('user_id', fixture.user.userId).delete()
    await BusinessUnit.query()
      .where('business_unit_id', fixture.businessUnit.businessUnitId)
      .delete()
    await Person.query().where('person_id', fixture.person.personId).delete()
  })

  test('CA-1: serialize() no expone rfc ni rfcHash; la propiedad rfc conserva el valor', async ({
    assert,
  }) => {
    const fx = fixture!
    const reloaded = await TenantBillingProfile.findOrFail(fx.profile.tenantBillingProfileId)
    const serialized = reloaded.serialize()

    assert.isUndefined(serialized.rfc)
    assert.isUndefined(serialized.rfcHash)
    assert.equal(reloaded.rfc, fx.rfc)
  })

  test('CA-3: GET /api/billing/profile devuelve el RFC capturado al owner', async ({
    client,
    assert,
  }) => {
    const fx = fixture!

    const response = await client
      .get(PROFILE_URL)
      .loginAs(fx.user)
      .header('X-Business-Unit-Id', fx.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    const data = response.body().data as Record<string, unknown>
    assert.equal(data.rfc, fx.rfc)
    assert.isTrue(data.billingProfileComplete)
  })

  test('CA-6: RFC indescifrable responde null sin filtrar el ciphertext', async ({
    client,
    assert,
  }) => {
    const fx = fixture!

    await db
      .from('tenant_billing_profiles')
      .where('tenant_billing_profile_id', fx.profile.tenantBillingProfileId)
      .update({ tenant_billing_profile_rfc: INVALID_CIPHERTEXT })

    const response = await client
      .get(PROFILE_URL)
      .loginAs(fx.user)
      .header('X-Business-Unit-Id', fx.businessUnit.businessUnitPublicId)

    response.assertStatus(200)
    assert.isNull((response.body().data as Record<string, unknown>).rfc)
    assert.notInclude(response.text(), INVALID_CIPHERTEXT)
  })
})

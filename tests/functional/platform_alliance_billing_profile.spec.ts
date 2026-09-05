import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Alliance from '#models/alliance'
import DiscountCode from '#models/discount_code'
import AllianceBillingProfile from '#models/alliance_billing_profile'
import SatTaxRegime from '#models/sat_tax_regime'
import SatCfdiUse from '#models/sat_cfdi_use'
import { ALLIANCE_ERROR_CODES } from '#constants/alliance_error_codes'

/**
 * Tests funcionales — perfil fiscal de la alianza (USRH1788505941893).
 * Incluye el caso obligatorio de no-fuga del RFC.
 */

const TEST_PASSWORD = 'AllianceBillingTest123!'
const BASE = '/api/platform/alliances'
const VALID_MORAL_RFC = 'ALI010101AB4'
const INVALID_MORAL_RFC = 'ALI010101AB5'

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

interface SatPair {
  taxRegimeCode: string
  cfdiUseCode: string
  fisicaOnlyRegime: string
  incompatibleCfdiUse: string
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Alliance',
    personLastname: 'Billing',
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
    businessUnitName: `Alliance Billing BU ${stamp}`,
    businessUnitSlug: `alliance-bill-bu-${stamp}`,
    businessUnitLegalName: `Alliance Billing Legal ${stamp}`,
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

async function createAlliance(name: string, active: 0 | 1 = 1): Promise<Alliance> {
  return Alliance.create({
    allianceName: name,
    allianceContactName: null,
    allianceContactEmail: null,
    allianceContactPhone: null,
    allianceDefaultCommissionPercent: 10,
    allianceDefaultTermPeriods: null,
    allianceActive: active,
  })
}

/** Resuelve claves SAT reales del catálogo sembrado; no se inventan. */
async function resolveSatPair(): Promise<SatPair> {
  const moralRegime = await SatTaxRegime.query()
    .where('sat_tax_regime_applies_to_legal_entity', 1)
    .whereNull('sat_tax_regime_deleted_at')
    .firstOrFail()

  const uses = await SatCfdiUse.query().whereNull('sat_cfdi_use_deleted_at').preload('taxRegimes')
  const compatible = uses.find((use) =>
    use.taxRegimes.some((regime) => regime.satTaxRegimeCode === moralRegime.satTaxRegimeCode)
  )
  const incompatible = uses.find(
    (use) =>
      !use.taxRegimes.some((regime) => regime.satTaxRegimeCode === moralRegime.satTaxRegimeCode)
  )
  const fisicaOnly = await SatTaxRegime.query()
    .where('sat_tax_regime_applies_to_individual', 1)
    .where('sat_tax_regime_applies_to_legal_entity', 0)
    .whereNull('sat_tax_regime_deleted_at')
    .firstOrFail()

  if (!compatible || !incompatible) {
    throw new Error('El catálogo SAT no tiene un uso compatible e incompatible para el régimen moral')
  }

  return {
    taxRegimeCode: moralRegime.satTaxRegimeCode,
    cfdiUseCode: compatible.satCfdiUseCode,
    fisicaOnlyRegime: fisicaOnly.satTaxRegimeCode,
    incompatibleCfdiUse: incompatible.satCfdiUseCode,
  }
}

function serializedHasRfcLeak(body: unknown, rfc: string): boolean {
  const raw = JSON.stringify(body)
  return (
    /"rfc"\s*:/.test(raw) ||
    raw.includes('rfcHash') ||
    raw.includes('rfc_hash') ||
    raw.includes(rfc) ||
    raw.toLowerCase().includes(rfc.toLowerCase())
  )
}

test.group('GET/PUT /api/platform/alliances/:id/billing-profile', (group) => {
  let admin: TestActor | null = null
  let sat: SatPair
  const allianceIds: number[] = []
  const profileIds: number[] = []

  group.setup(async () => {
    admin = await createActor('alliance-bill-admin', true)
    sat = await resolveSatPair()
  })

  group.teardown(async () => {
    if (profileIds.length > 0) {
      await AllianceBillingProfile.query().whereIn('alliance_billing_profile_id', profileIds).delete()
    }
    if (allianceIds.length > 0) {
      await DiscountCode.query().whereIn('discount_code_alliance_id', allianceIds).delete()
      await Alliance.query().whereIn('alliance_id', allianceIds).delete()
    }
    await cleanupActor(admin)
  })

  test('1. GET sin fila responde 200 heredando legalName y no es 404', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance(`Perfil vacío ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    const response = await client
      .get(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)

    response.assertStatus(200)
    const data = response.body().data
    assert.equal(data.exists, false)
    assert.equal(data.legalName, alliance.allianceName)
    assert.isNull(data.rfc)
    assert.isFalse(data.billingProfileComplete)
    assert.includeMembers(data.missingFields, ['rfc', 'postalCode', 'taxRegimeCode', 'cfdiUseCode'])
    assert.isNull(data.createdAt)
  })

  test('2. PUT completo con RFC moral deriva taxpayerType y marca pagable', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance(`Perfil completo ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    const response = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'Alianza Industrial SA de CV',
        rfc: VALID_MORAL_RFC,
        postalCode: '06600',
        taxRegimeCode: sat.taxRegimeCode,
        cfdiUseCode: sat.cfdiUseCode,
        billingEmail: 'facturas@alianza.example',
      })

    response.assertStatus(200)
    const data = response.body().data
    assert.equal(data.exists, true)
    assert.equal(data.rfc, VALID_MORAL_RFC)
    assert.equal(data.taxpayerType, 'moral')
    assert.isTrue(data.billingProfileComplete)
    assert.deepEqual(data.missingFields, [])

    const persisted = await AllianceBillingProfile.query()
      .where('alliance_id', alliance.allianceId)
      .firstOrFail()
    profileIds.push(persisted.allianceBillingProfileId)
    assert.isString(persisted.rfcHash)
    assert.equal(persisted.rfcHash?.length, 64)
    assert.notEqual(persisted.serialize().rfc, VALID_MORAL_RFC)
    assert.isUndefined(persisted.serialize().rfc)
    assert.isUndefined(persisted.serialize().rfcHash)
  })

  test('3. RFC con dígito incorrecto responde RFC_INVALID y no toca el perfil', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance(`Perfil rfc malo ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    const created = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'Razon original',
        rfc: VALID_MORAL_RFC,
        postalCode: '06600',
        taxRegimeCode: sat.taxRegimeCode,
        cfdiUseCode: sat.cfdiUseCode,
      })
    created.assertStatus(200)
    const createdRow = await AllianceBillingProfile.query()
      .where('alliance_id', alliance.allianceId)
      .firstOrFail()
    profileIds.push(createdRow.allianceBillingProfileId)

    const rejected = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'No debe guardarse',
        rfc: INVALID_MORAL_RFC,
      })

    rejected.assertStatus(422)
    rejected.assertBodyContains({
      key: 'rfc-invalido',
      code: ALLIANCE_ERROR_CODES.RFC_INVALID,
    })

    const persisted = await AllianceBillingProfile.query()
      .where('alliance_id', alliance.allianceId)
      .firstOrFail()
    assert.equal(persisted.legalName, 'Razon original')
    assert.equal(persisted.rfc, VALID_MORAL_RFC)
  })

  test('4. rechaza régimen desconocido, régimen de física y uso incompatible', async ({
    client,
  }) => {
    const alliance = await createAlliance(`Perfil SAT ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    const unknown = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'SAT desconocido',
        rfc: VALID_MORAL_RFC,
        taxRegimeCode: '999',
      })
    unknown.assertStatus(422)
    unknown.assertBodyContains({ code: ALLIANCE_ERROR_CODES.TAX_REGIME_UNKNOWN })

    const wrongType = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'SAT tipo',
        rfc: VALID_MORAL_RFC,
        taxRegimeCode: sat.fisicaOnlyRegime,
      })
    wrongType.assertStatus(422)
    wrongType.assertBodyContains({ code: ALLIANCE_ERROR_CODES.TAX_REGIME_NOT_FOR_PERSON_TYPE })

    const badUse = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'SAT uso',
        rfc: VALID_MORAL_RFC,
        taxRegimeCode: sat.taxRegimeCode,
        cfdiUseCode: sat.incompatibleCfdiUse,
      })
    badUse.assertStatus(422)
    badUse.assertBodyContains({ code: ALLIANCE_ERROR_CODES.CFDI_USE_NOT_FOR_REGIME })

    const leftover = await AllianceBillingProfile.query().where('alliance_id', alliance.allianceId)
    if (leftover[0]) profileIds.push(leftover[0].allianceBillingProfileId)
  })

  test('5. perfil parcial RFC + razón social se acepta y declara exactamente lo que falta', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance(`Perfil parcial ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    const response = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'Parcial SA',
        rfc: VALID_MORAL_RFC,
      })

    response.assertStatus(200)
    const data = response.body().data
    assert.isFalse(data.billingProfileComplete)
    assert.deepEqual(data.missingFields, ['postalCode', 'taxRegimeCode', 'cfdiUseCode'])

    const persisted = await AllianceBillingProfile.query()
      .where('alliance_id', alliance.allianceId)
      .firstOrFail()
    profileIds.push(persisted.allianceBillingProfileId)
  })

  test('6. segundo PUT conserva una sola fila y null explícito limpia el campo', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance(`Perfil upsert ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    const first = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'Primera razon',
        rfc: VALID_MORAL_RFC,
        postalCode: '06600',
        billingEmail: 'uno@example.com',
      })
    first.assertStatus(200)

    const second = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'Segunda razon',
        billingEmail: null,
      })
    second.assertStatus(200)
    assert.equal(second.body().data.legalName, 'Segunda razon')
    assert.equal(second.body().data.rfc, VALID_MORAL_RFC)
    assert.equal(second.body().data.postalCode, '06600')
    assert.isNull(second.body().data.billingEmail)

    const rows = await AllianceBillingProfile.query().where('alliance_id', alliance.allianceId)
    assert.equal(rows.length, 1)
    profileIds.push(rows[0].allianceBillingProfileId)
  })

  test('7. se puede corregir el perfil de una alianza inactiva', async ({ client, assert }) => {
    const alliance = await createAlliance(`Perfil inactiva ${Date.now()}`, 0)
    allianceIds.push(alliance.allianceId)

    const response = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'Retirada SA',
        rfc: VALID_MORAL_RFC,
        postalCode: '06600',
        taxRegimeCode: sat.taxRegimeCode,
        cfdiUseCode: sat.cfdiUseCode,
      })

    response.assertStatus(200)
    assert.isTrue(response.body().data.billingProfileComplete)
    const persisted = await AllianceBillingProfile.query()
      .where('alliance_id', alliance.allianceId)
      .firstOrFail()
    profileIds.push(persisted.allianceBillingProfileId)
  })

  test('8. dos alianzas pueden registrar el mismo RFC', async ({ client, assert }) => {
    const first = await createAlliance(`RFC compartido A ${Date.now()}`)
    const second = await createAlliance(`RFC compartido B ${Date.now()}`)
    allianceIds.push(first.allianceId, second.allianceId)

    const a = await client
      .put(`${BASE}/${first.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({ legalName: 'Primera', rfc: VALID_MORAL_RFC })
    const b = await client
      .put(`${BASE}/${second.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({ legalName: 'Segunda', rfc: VALID_MORAL_RFC })

    a.assertStatus(200)
    b.assertStatus(200)
    assert.equal(a.body().data.rfc, VALID_MORAL_RFC)
    assert.equal(b.body().data.rfc, VALID_MORAL_RFC)

    const rows = await AllianceBillingProfile.query().whereIn('alliance_id', [
      first.allianceId,
      second.allianceId,
    ])
    for (const row of rows) profileIds.push(row.allianceBillingProfileId)
  })

  test('9. ninguna respuesta de alianza filtra rfc ni rfcHash', async ({ client, assert }) => {
    const alliance = await createAlliance(`No fuga ${Date.now()}`)
    allianceIds.push(alliance.allianceId)

    const created = await client
      .put(`${BASE}/${alliance.allianceId}/billing-profile`)
      .loginAs(admin!.user)
      .json({
        legalName: 'No Fuga SA',
        rfc: VALID_MORAL_RFC,
        postalCode: '06600',
        taxRegimeCode: sat.taxRegimeCode,
        cfdiUseCode: sat.cfdiUseCode,
      })
    created.assertStatus(200)
    const leakProfile = await AllianceBillingProfile.query()
      .where('alliance_id', alliance.allianceId)
      .firstOrFail()
    profileIds.push(leakProfile.allianceBillingProfileId)

    const store = await client.post(BASE).loginAs(admin!.user).json({
      allianceName: `No fuga alta ${Date.now()}`,
      allianceDefaultCommissionPercent: 5,
    })
    store.assertStatus(201)
    allianceIds.push(store.body().data.allianceId)

    const surfaces = [
      await client.get(BASE).qs({ search: alliance.allianceName }).loginAs(admin!.user),
      await client.get(`${BASE}/${alliance.allianceId}`).loginAs(admin!.user),
      store,
      await client
        .patch(`${BASE}/${alliance.allianceId}`)
        .loginAs(admin!.user)
        .json({ allianceDefaultCommissionPercent: 6 }),
      await client.post(`${BASE}/${alliance.allianceId}/deactivate`).loginAs(admin!.user),
      await client.post(`${BASE}/${alliance.allianceId}/activate`).loginAs(admin!.user),
    ]

    for (const response of surfaces) {
      assert.isFalse(
        serializedHasRfcLeak(response.body(), VALID_MORAL_RFC),
        `fuga de RFC en la respuesta → ${JSON.stringify(response.body()).slice(0, 180)}`
      )
      if (response.body().data && !Array.isArray(response.body().data)) {
        assert.property(response.body().data, 'billingProfileComplete')
        assert.property(response.body().data, 'missingFields')
      }
    }

    const listed = await client.get(BASE).qs({ search: alliance.allianceName }).loginAs(admin!.user)
    const listRow = listed.body().data[0]
    assert.isTrue(listRow.billingProfileComplete)
    assert.deepEqual(listRow.missingFields, [])
    assert.notProperty(listRow, 'rfc')
  })
})

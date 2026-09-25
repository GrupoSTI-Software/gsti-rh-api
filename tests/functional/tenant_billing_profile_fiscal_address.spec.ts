import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import TenantBillingProfile from '#models/tenant_billing_profile'
import User from '#models/user'
import TenantBillingProfileService from '#services/tenant_billing_profile_service'
import { blindIndex } from '#utils/blind_index'
import { computeRfcCheckDigit } from '../../app/shared/validators/rfc.validator.js'
import { ensureRole } from '#tests/helpers/ensure_role'

/**
 * USRH1789097550393 — domicilio fiscal y representante legal del perfil del
 * tenant: captura completa, "ausente = conservar", "null = limpiar", topes,
 * solo dueño de la cuenta, aislamiento por empresa, no regresión de la
 * completitud y del RFC, e identidad fiscal para documentos sin RFC.
 */

const TEST_PASSWORD = 'TenantBillingAddress123!'
const PROFILE_URL = '/api/billing/profile'

const FISCAL_IDENTITY_KEYS = [
  'legalName',
  'postalCode',
  'street',
  'exteriorNumber',
  'interiorNumber',
  'neighborhood',
  'municipality',
  'state',
  'legalRepresentativeName',
  'legalRepresentativeRole',
]

const ADDRESS_KEYS = [
  'street',
  'exteriorNumber',
  'interiorNumber',
  'neighborhood',
  'municipality',
  'state',
  'legalRepresentativeName',
  'legalRepresentativeRole',
]

const FULL_ADDRESS = {
  street: 'Av. Reforma',
  exteriorNumber: '222',
  interiorNumber: '3B',
  neighborhood: 'Juárez',
  municipality: 'Cuauhtémoc',
  state: 'Ciudad de México',
  legalRepresentativeName: 'María Pérez López',
  legalRepresentativeRole: 'Apoderado legal',
}

function buildValidRfc(): string {
  const base = 'ABC85010100'
  return `${base}${computeRfcCheckDigit(base)}`
}

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

interface Fixture {
  owner: User
  ownerPerson: Person
  employee: User
  employeePerson: Person
  businessUnit: BusinessUnit
  otherBusinessUnit: BusinessUnit
  profile: TenantBillingProfile
  rfc: string
}

async function createUser(
  prefix: string,
  roleSlug: 'owner' | 'empleado'
): Promise<{ user: User; person: Person }> {
  const stamp = uniqueStamp()
  const email = `tbp-address-${prefix}-${stamp}@gsti-tests.local`
  const role = await ensureRole(roleSlug)
  const person = await Person.create({
    personFirstname: 'TenantBilling',
    personLastname: 'Address',
    personSecondLastname: prefix,
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
  return { user, person }
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  return await BusinessUnit.create({
    businessUnitName: `TBP address ${prefix} ${stamp}`,
    businessUnitSlug: `tbp-address-${prefix}-${stamp}`,
    businessUnitLegalName: `TBP address ${prefix} legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'self_service',
  })
}

async function createFixture(): Promise<Fixture> {
  const rfc = buildValidRfc()
  const owner = await createUser('owner', 'owner')
  const employee = await createUser('rh', 'empleado')
  const businessUnit = await createBusinessUnit('propia')
  const otherBusinessUnit = await createBusinessUnit('ajena')
  await owner.user.related('businessUnits').attach([businessUnit.businessUnitId])
  await employee.user.related('businessUnits').attach([businessUnit.businessUnitId])

  // Fila previa a la migración: las ocho columnas nuevas en NULL
  const profile = await TenantBillingProfile.create({
    businessUnitId: businessUnit.businessUnitId,
    rfc,
    rfcHash: blindIndex(rfc),
    legalName: 'TBP Address SA de CV',
    postalCode: '06600',
    taxRegimeCode: '601',
    cfdiUseCode: 'G03',
    billingEmail: 'facturas-tbp-address@gsti-tests.local',
  })

  return {
    owner: owner.user,
    ownerPerson: owner.person,
    employee: employee.user,
    employeePerson: employee.person,
    businessUnit,
    otherBusinessUnit,
    profile,
    rfc,
  }
}

async function destroyFixture(fixture: Fixture): Promise<void> {
  await TenantBillingProfile.query()
    .where('business_unit_id', fixture.businessUnit.businessUnitId)
    .delete()
  for (const user of [fixture.owner, fixture.employee]) {
    await user.related('businessUnits').detach()
    await User.query().where('user_id', user.userId).delete()
  }
  await BusinessUnit.query()
    .whereIn('business_unit_id', [
      fixture.businessUnit.businessUnitId,
      fixture.otherBusinessUnit.businessUnitId,
    ])
    .delete()
  await Person.query()
    .whereIn('person_id', [fixture.ownerPerson.personId, fixture.employeePerson.personId])
    .delete()
}

type ProfileBody = { data: Record<string, unknown> }
type ErrorBody = { title: string; detail: string; key: string; code: string }

test.group('Perfil fiscal — domicilio y representante legal (USRH1789097550393)', (group) => {
  let fixture: Fixture

  const asOwner = (client: ApiClient) =>
    client
      .get(PROFILE_URL)
      .loginAs(fixture.owner)
      .header('X-Business-Unit-Id', fixture.businessUnit.businessUnitPublicId)

  const putAsOwner = (client: ApiClient, body: Record<string, unknown>) =>
    client
      .put(PROFILE_URL)
      .loginAs(fixture.owner)
      .header('X-Business-Unit-Id', fixture.businessUnit.businessUnitPublicId)
      .json(body)

  group.setup(async () => {
    fixture = await createFixture()
  })

  group.teardown(async () => {
    await destroyFixture(fixture)
  })

  test('las ocho columnas nacen en null para un perfil previo y no entran a la completitud', async ({
    client,
    assert,
  }) => {
    const response = await asOwner(client)
    response.assertStatus(200)
    const data = (response.body() as ProfileBody).data
    for (const key of ADDRESS_KEYS) {
      assert.isNull(data[key], key)
    }
    assert.isTrue(data.billingProfileComplete)
    assert.deepEqual(data.missingFields, [])
  })

  test('PUT solo con legalName y taxRegimeCode conserva las ocho en null (ausente = conservar)', async ({
    client,
    assert,
  }) => {
    const response = await putAsOwner(client, {
      legalName: 'TBP Address SA de CV',
      taxRegimeCode: '601',
    })
    response.assertStatus(200)
    const data = (response.body() as ProfileBody).data
    for (const key of ADDRESS_KEYS) {
      assert.isNull(data[key], key)
    }
    assert.strictEqual(data.rfc, fixture.rfc)
  })

  test('PUT con los ocho campos los guarda, el GET los devuelve iguales y la completitud no cambia', async ({
    client,
    assert,
  }) => {
    const beforeResponse = await asOwner(client)
    const before = (beforeResponse.body() as ProfileBody).data
    const response = await putAsOwner(client, {
      legalName: 'TBP Address SA de CV',
      ...FULL_ADDRESS,
    })
    response.assertStatus(200)
    const saved = (response.body() as ProfileBody).data
    for (const [key, value] of Object.entries(FULL_ADDRESS)) {
      assert.strictEqual(saved[key], value, key)
    }
    assert.strictEqual(saved.billingProfileComplete, before.billingProfileComplete)
    assert.deepEqual(saved.missingFields, before.missingFields)
    assert.strictEqual(saved.postalCode, '06600')

    const reloadedResponse = await asOwner(client)
    const reloaded = (reloadedResponse.body() as ProfileBody).data
    for (const [key, value] of Object.entries(FULL_ADDRESS)) {
      assert.strictEqual(reloaded[key], value, key)
    }
  })

  test('PUT con street null explícito la limpia sin tocar el resto del domicilio', async ({
    client,
    assert,
  }) => {
    const response = await putAsOwner(client, { legalName: 'TBP Address SA de CV', street: null })
    response.assertStatus(200)
    const data = (response.body() as ProfileBody).data
    assert.isNull(data.street)
    assert.strictEqual(data.exteriorNumber, FULL_ADDRESS.exteriorNumber)
    assert.strictEqual(data.neighborhood, FULL_ADDRESS.neighborhood)
    assert.strictEqual(data.legalRepresentativeName, FULL_ADDRESS.legalRepresentativeName)
  })

  test('un campo que excede su tope responde 422 datos-invalidos y no escribe nada', async ({
    client,
    assert,
  }) => {
    const response = await putAsOwner(client, {
      legalName: 'TBP Address SA de CV',
      state: 'x'.repeat(140),
      municipality: 'Otro municipio',
    })
    response.assertStatus(422)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.title, 'Datos de facturación')
    // El resolvedor vigente publica el mensaje de VineJS del campo ofensor
    assert.include(body.detail, 'state')
    assert.strictEqual(body.key, 'datos-invalidos')
    assert.strictEqual(body.code, 'TNT.BILL.VAL_INPUT')
    const afterResponse = await asOwner(client)
    const data = (afterResponse.body() as ProfileBody).data
    assert.strictEqual(data.municipality, FULL_ADDRESS.municipality)
    assert.strictEqual(data.state, FULL_ADDRESS.state)
  })

  test('un rol que no es dueño de la cuenta recibe 403 sin nada del perfil', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(PROFILE_URL)
      .loginAs(fixture.employee)
      .header('X-Business-Unit-Id', fixture.businessUnit.businessUnitPublicId)
    response.assertStatus(403)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.key, 'solo-el-dueno-de-la-cuenta')
    assert.strictEqual(body.code, 'TNT.BILL.FORBIDDEN_ROLE')
    assert.notInclude(response.text(), FULL_ADDRESS.exteriorNumber)
    assert.notInclude(response.text(), fixture.rfc)
  })

  test('el header de una empresa fuera del alcance responde el 404 del middleware', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(PROFILE_URL)
      .loginAs(fixture.owner)
      .header('X-Business-Unit-Id', fixture.otherBusinessUnit.businessUnitPublicId)
    response.assertStatus(404)
    assert.strictEqual((response.body() as ErrorBody).key, 'BU.NOT.001')
    assert.notInclude(response.text(), FULL_ADDRESS.neighborhood)
  })

  test('no regresión del RFC: el GET lo sigue devolviendo y JSON.stringify del modelo no', async ({
    client,
    assert,
  }) => {
    const response = await asOwner(client)
    response.assertStatus(200)
    assert.strictEqual((response.body() as ProfileBody).data.rfc, fixture.rfc)

    const reloaded = await TenantBillingProfile.findOrFail(fixture.profile.tenantBillingProfileId)
    assert.notInclude(JSON.stringify(reloaded), fixture.rfc)
  })

  test('getFiscalIdentityForDocuments entrega exactamente diez claves y nunca el RFC', async ({
    assert,
  }) => {
    const service = new TenantBillingProfileService()
    const identity = await service.getFiscalIdentityForDocuments(
      fixture.businessUnit.businessUnitId
    )
    assert.sameMembers(Object.keys(identity), FISCAL_IDENTITY_KEYS)
    assert.isFalse('rfc' in identity)
    assert.isFalse('rfcHash' in identity)
    assert.notInclude(JSON.stringify(identity), fixture.rfc)
    assert.strictEqual(identity.legalName, 'TBP Address SA de CV')
    assert.strictEqual(identity.exteriorNumber, FULL_ADDRESS.exteriorNumber)

    // Sin perfil: razón social de la empresa y el resto en null
    const inherited = await service.getFiscalIdentityForDocuments(
      fixture.otherBusinessUnit.businessUnitId
    )
    assert.sameMembers(Object.keys(inherited), FISCAL_IDENTITY_KEYS)
    assert.strictEqual(inherited.legalName, fixture.otherBusinessUnit.businessUnitLegalName)
    assert.isNull(inherited.street)
    assert.isNull(inherited.legalRepresentativeName)
  })
})

import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import TenantBillingProfile from '#models/tenant_billing_profile'
import { blindIndex } from '#utils/blind_index'

/**
 * USRH1788052455649 — contrato del listado de plataforma con la completitud
 * fiscal. Cubre el criterio duro de privacidad: al listado suben únicamente los
 * dos datos derivados, y ningún dato fiscal capturado (regla 4).
 */

const TEST_PASSWORD = 'BillingGapsTest123!'
const BASE_URL = '/api/platform/tenants'
const CAPTURED_RFC = 'ABC010101AB9'

/**
 * Llaves exactas que puede tener un elemento del listado. Es una lista cerrada a
 * propósito: si alguien agrega un campo fiscal al DTO, este test lo detiene.
 */
const EXPECTED_ITEM_KEYS = [
  'activeEmployees',
  'billingProfileComplete',
  'businessUnitActive',
  'businessUnitLegalName',
  'businessUnitName',
  'businessUnitPublicId',
  'hasBiometrics',
  'missingFields',
  'subscription',
]

interface TestActor {
  user: User
  person: Person
}

interface TestFixtures {
  stamp: string
  admin: TestActor
  outsider: TestActor
  businessUnitIds: number[]
}

/** Crea un usuario con o sin la marca de administrador de plataforma. */
async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'BillingGaps',
    personLastname: 'Test',
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

/** Empresa de prueba cuyo nombre lleva el sello de la corrida para poder filtrarla. */
async function createTenant(stamp: string, label: string): Promise<BusinessUnit> {
  return BusinessUnit.create({
    businessUnitName: `BG ${label} ${stamp}`,
    businessUnitSlug: `bg-${label.toLowerCase()}-${stamp}`,
    businessUnitLegalName: `BG ${label} ${stamp} SA de CV`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

test.group('GET /api/platform/tenants — completitud fiscal', (group) => {
  let fixtures: TestFixtures | null = null

  group.setup(async () => {
    const stamp = `${Date.now()}`
    const admin = await createActor('bg-admin', true)
    const outsider = await createActor('bg-outsider', false)

    // A) Perfil completo → no aparece como pendiente.
    const complete = await createTenant(stamp, 'COMPLETA')
    await TenantBillingProfile.create({
      businessUnitId: complete.businessUnitId,
      rfc: CAPTURED_RFC,
      rfcHash: blindIndex(CAPTURED_RFC),
      legalName: 'BG Completa SA de CV',
      postalCode: '06600',
      taxRegimeCode: '601',
      cfdiUseCode: 'G03',
      billingEmail: 'facturas-bg@gsti-tests.local',
    })

    // B) Perfil parcial: le faltan el código postal y el uso de CFDI.
    const partial = await createTenant(stamp, 'PARCIAL')
    await TenantBillingProfile.create({
      businessUnitId: partial.businessUnitId,
      rfc: CAPTURED_RFC,
      rfcHash: blindIndex(CAPTURED_RFC),
      legalName: 'BG Parcial SA de CV',
      postalCode: null,
      taxRegimeCode: '601',
      cfdiUseCode: null,
      billingEmail: null,
    })

    // C) Nunca capturó perfil fiscal → los cinco datos faltantes.
    const never = await createTenant(stamp, 'NUNCA')

    // D) Empresa dada de baja: no debe aparecer en el listado.
    const removed = await createTenant(stamp, 'BAJA')
    await removed.delete()

    fixtures = {
      stamp,
      admin,
      outsider,
      businessUnitIds: [
        complete.businessUnitId,
        partial.businessUnitId,
        never.businessUnitId,
        removed.businessUnitId,
      ],
    }
  })

  group.teardown(async () => {
    if (!fixtures) return

    await TenantBillingProfile.query()
      .whereIn('business_unit_id', fixtures.businessUnitIds)
      .delete()
    await BusinessUnit.query().whereIn('business_unit_id', fixtures.businessUnitIds).delete()

    for (const actor of [fixtures.admin, fixtures.outsider]) {
      await User.query().where('user_id', actor.user.userId).delete()
      await Person.query().where('person_id', actor.person.personId).delete()
    }
  })

  test('BG-1: el perfil incompleto trae los datos faltantes en el orden del catálogo', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ search: fixtures!.stamp })
      .loginAs(fixtures!.admin.user)

    response.assertStatus(200)

    const items = response.body().data as Array<Record<string, unknown>>
    const partial = items.find((i) => String(i.businessUnitName).includes('PARCIAL'))

    assert.exists(partial, 'la empresa con perfil parcial debe venir en el listado')
    assert.isFalse(partial!.billingProfileComplete)
    assert.deepEqual(partial!.missingFields, ['postalCode', 'cfdiUseCode'])
  })

  test('BG-2: la empresa que nunca capturó perfil trae los cinco datos faltantes', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ search: fixtures!.stamp })
      .loginAs(fixtures!.admin.user)

    response.assertStatus(200)

    const items = response.body().data as Array<Record<string, unknown>>
    const never = items.find((i) => String(i.businessUnitName).includes('NUNCA'))

    assert.exists(never, 'la empresa sin perfil debe venir en el listado, no ausente')
    assert.isFalse(never!.billingProfileComplete)
    assert.deepEqual(never!.missingFields, [
      'rfc',
      'legalName',
      'postalCode',
      'taxRegimeCode',
      'cfdiUseCode',
    ])
  })

  test('BG-3: la empresa con los cinco datos capturados viene completa y sin faltantes', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ search: fixtures!.stamp })
      .loginAs(fixtures!.admin.user)

    response.assertStatus(200)

    const items = response.body().data as Array<Record<string, unknown>>
    const complete = items.find((i) => String(i.businessUnitName).includes('COMPLETA'))

    assert.exists(complete)
    assert.isTrue(complete!.billingProfileComplete)
    assert.deepEqual(complete!.missingFields, [])
  })

  test('BG-4: ningún elemento publica un dato fiscal capturado (regla 4)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ search: fixtures!.stamp })
      .loginAs(fixtures!.admin.user)

    response.assertStatus(200)

    const items = response.body().data as Array<Record<string, unknown>>
    assert.isAbove(items.length, 0)

    for (const item of items) {
      assert.deepEqual(
        Object.keys(item).sort(),
        EXPECTED_ITEM_KEYS,
        'el DTO del listado es una lista cerrada: ningún campo fiscal ni id interno'
      )
    }

    // El RFC capturado existe en la base pero no puede aparecer en el JSON. Se
    // excluye el identificador público de la comparación: es un UUID hexadecimal
    // y podría contener por casualidad la misma secuencia que un código postal.
    const raw = items.map((item) => JSON.stringify({ ...item, businessUnitPublicId: '' })).join('')

    assert.notInclude(raw, CAPTURED_RFC, 'el RFC capturado no viaja al listado')
    assert.notInclude(raw, 'facturas-bg@gsti-tests.local', 'el correo de facturación no viaja')
    assert.notInclude(raw, '06600', 'el código postal capturado no viaja')
  })

  test('BG-5: la empresa dada de baja no aparece en el listado (regla 5)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ search: fixtures!.stamp })
      .loginAs(fixtures!.admin.user)

    response.assertStatus(200)

    const names = (response.body().data as Array<Record<string, unknown>>).map((i) =>
      String(i.businessUnitName)
    )

    assert.isFalse(
      names.some((name) => name.includes('BAJA')),
      'la empresa borrada no debe listarse como pendiente de facturación'
    )
  })

  test('BG-6: el listado sale ordenado por nombre comercial (regla 8)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ search: fixtures!.stamp })
      .loginAs(fixtures!.admin.user)

    response.assertStatus(200)

    const names = (response.body().data as Array<Record<string, unknown>>).map((i) =>
      String(i.businessUnitName)
    )

    assert.deepEqual(names, [...names].sort(), 'las filas vienen ordenadas por nombre comercial')
  })

  test('BG-7: un usuario sin marca de plataforma recibe 403 sin campo code', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(fixtures!.outsider.user)

    response.assertStatus(403)
    assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.notProperty(response.body(), 'code')
  })

  test('BG-8: un limit fuera del máximo recibe 422 con PLT.TEN.VAL_INPUT', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ limit: 500 })
      .loginAs(fixtures!.admin.user)

    response.assertStatus(422)
    assert.equal(response.body().code, 'PLT.TEN.VAL_INPUT')
    // Inconsistencia heredada del módulo: el `key` repite el `code`. Esta HU la
    // documenta y NO la corrige (rompería contrato con consumidores vigentes).
    assert.equal(response.body().key, 'PLT.TEN.VAL_INPUT')
    assert.exists(response.body().title)
    assert.exists(response.body().detail)
  })

  test('BG-9: el envelope y los metadatos de paginación no cambian', async ({ client, assert }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ search: fixtures!.stamp })
      .loginAs(fixtures!.admin.user)

    response.assertStatus(200)

    const body = response.body()
    assert.equal(body.type, 'success')
    assert.isArray(body.data)
    assert.deepEqual(Object.keys(body.meta).sort(), ['lastPage', 'limit', 'page', 'total'])
  })
})

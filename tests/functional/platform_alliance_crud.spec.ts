import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Alliance from '#models/alliance'
import DiscountCode from '#models/discount_code'
import { ALLIANCE_ERROR_CODES } from '#constants/alliance_error_codes'

/**
 * Tests funcionales — CRUD de alianzas comerciales
 * (USRH1788505941892). Cubre alta, listado, detalle, corrección, activar
 * y desactivar, más los rechazos tipados del catálogo PLT.ALL.*.
 */

const TEST_PASSWORD = 'AllianceCrudTest123!'
const BASE_URL = '/api/platform/alliances'

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
    personLastname: 'Crud',
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
    businessUnitName: `Alliance CRUD BU ${stamp}`,
    businessUnitSlug: `alliance-crud-bu-${stamp}`,
    businessUnitLegalName: `Alliance CRUD Legal ${stamp}`,
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

async function cleanupAlliances(ids: number[]) {
  if (ids.length === 0) return
  await DiscountCode.query().whereIn('discount_code_alliance_id', ids).delete()
  await Alliance.query().whereIn('alliance_id', ids).delete()
}

test.group('POST /api/platform/alliances — alta', (group) => {
  let admin: TestActor | null = null
  const createdIds: number[] = []

  group.setup(async () => {
    admin = await createActor('alliance-crud-store', true)
  })

  group.teardown(async () => {
    await cleanupAlliances(createdIds)
    await cleanupActor(admin)
  })

  test('1. crea una alianza con plazo determinado y responde 201 AllianceView activa', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const response = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({
        allianceName: `Despacho Norte ${stamp}`,
        allianceContactName: 'Ana López',
        allianceContactEmail: `ana-${stamp}@despacho.example`,
        allianceContactPhone: '5551234567',
        allianceDefaultCommissionPercent: 12.5,
        allianceDefaultTermPeriods: 12,
      })

    response.assertStatus(201)
    const body = response.body()
    assert.equal(body.type, 'success')
    const data = body.data
    createdIds.push(data.allianceId)

    assert.equal(data.allianceName, `Despacho Norte ${stamp}`)
    assert.equal(data.allianceContactName, 'Ana López')
    assert.equal(data.allianceContactEmail, `ana-${stamp}@despacho.example`)
    assert.equal(data.allianceContactPhone, '5551234567')
    assert.equal(Number(data.allianceDefaultCommissionPercent), 12.5)
    assert.equal(data.allianceDefaultTermPeriods, 12)
    assert.equal(data.allianceActive, 1)
    assert.isString(data.createdAt)
    assert.property(data, 'updatedAt')
  })

  test('2. crea una alianza con plazo indeterminado (sin periodos)', async ({ client, assert }) => {
    const stamp = Date.now()
    const response = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({
        allianceName: `Consultor Independiente ${stamp}`,
        allianceDefaultCommissionPercent: 0,
      })

    response.assertStatus(201)
    const data = response.body().data
    createdIds.push(data.allianceId)
    assert.equal(data.allianceActive, 1)
    assert.isNull(data.allianceDefaultTermPeriods)
    assert.equal(Number(data.allianceDefaultCommissionPercent), 0)
    assert.isNull(data.allianceContactName)
  })

  test('3. rechaza comisión fuera de rango o con más de dos decimales y no deja fila', async ({
    client,
    assert,
  }) => {
    const nameDecimals = `Alianza decimales ${Date.now()}`
    const decimals = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({
        allianceName: nameDecimals,
        allianceDefaultCommissionPercent: 10.123,
      })

    decimals.assertStatus(422)
    decimals.assertBodyContains({
      key: 'comision-fuera-de-rango',
      code: ALLIANCE_ERROR_CODES.COMMISSION_OUT_OF_RANGE,
    })

    const nameRange = `Alianza rango ${Date.now()}`
    const range = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({
        allianceName: nameRange,
        allianceDefaultCommissionPercent: 101,
      })

    range.assertStatus(422)
    range.assertBodyContains({
      key: 'comision-fuera-de-rango',
      code: ALLIANCE_ERROR_CODES.COMMISSION_OUT_OF_RANGE,
    })

    const leftover = await Alliance.query()
      .whereIn('alliance_name', [nameDecimals, nameRange])
      .whereNull('alliance_deleted_at')
    assert.equal(leftover.length, 0)
  })

  test('4. rechaza plazo determinado con 0 o negativo', async ({ client }) => {
    const zero = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({
        allianceName: `Plazo cero ${Date.now()}`,
        allianceDefaultCommissionPercent: 10,
        allianceDefaultTermPeriods: 0,
      })

    zero.assertStatus(422)
    zero.assertBodyContains({
      key: 'plazo-invalido',
      code: ALLIANCE_ERROR_CODES.TERM_PERIODS_INVALID,
    })

    const negative = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({
        allianceName: `Plazo negativo ${Date.now()}`,
        allianceDefaultCommissionPercent: 10,
        allianceDefaultTermPeriods: -3,
      })

    negative.assertStatus(422)
    negative.assertBodyContains({
      key: 'plazo-invalido',
      code: ALLIANCE_ERROR_CODES.TERM_PERIODS_INVALID,
    })
  })

  test('5. body inválido responde 422 VAL_INPUT', async ({ client }) => {
    const response = await client.post(BASE_URL).loginAs(admin!.user).json({
      allianceName: '',
      allianceDefaultCommissionPercent: 10,
    })

    response.assertStatus(422)
    response.assertBodyContains({
      key: 'datos-invalidos',
      code: ALLIANCE_ERROR_CODES.VAL_INPUT,
    })
  })

  test('6. dos altas con los mismos datos crean dos alianzas distintas', async ({
    client,
    assert,
  }) => {
    const payload = {
      allianceName: `Gemela ${Date.now()}`,
      allianceDefaultCommissionPercent: 8,
      allianceDefaultTermPeriods: 6,
    }

    const first = await client.post(BASE_URL).loginAs(admin!.user).json(payload)
    const second = await client.post(BASE_URL).loginAs(admin!.user).json(payload)

    first.assertStatus(201)
    second.assertStatus(201)
    createdIds.push(first.body().data.allianceId, second.body().data.allianceId)
    assert.notEqual(first.body().data.allianceId, second.body().data.allianceId)
  })
})

test.group('GET /api/platform/alliances — listado', (group) => {
  let admin: TestActor | null = null
  const createdIds: number[] = []
  const stamp = `${Date.now()}`

  group.setup(async () => {
    admin = await createActor('alliance-crud-list', true)
  })

  group.teardown(async () => {
    await cleanupAlliances(createdIds)
    await cleanupActor(admin)
  })

  test('7. filtra por search y active, pagina con meta y excluye soft-deleted', async ({
    client,
    assert,
  }) => {
    const active = await Alliance.create({
      allianceName: `Filtro Visible ${stamp}`,
      allianceContactName: `Contacto ${stamp}`,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 10,
      allianceDefaultTermPeriods: 4,
      allianceActive: 1,
    })
    const inactive = await Alliance.create({
      allianceName: `Filtro Retirada ${stamp}`,
      allianceContactName: null,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 15,
      allianceDefaultTermPeriods: null,
      allianceActive: 0,
    })
    const deleted = await Alliance.create({
      allianceName: `Filtro Borrada ${stamp}`,
      allianceContactName: null,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 5,
      allianceDefaultTermPeriods: null,
      allianceActive: 1,
    })
    await deleted.delete()
    createdIds.push(active.allianceId, inactive.allianceId, deleted.allianceId)

    const bySearch = await client
      .get(BASE_URL)
      .qs({ search: `Visible ${stamp}` })
      .loginAs(admin!.user)
    bySearch.assertStatus(200)
    const searchRows = bySearch.body().data as Array<{ allianceId: number; allianceName: string }>
    assert.isTrue(searchRows.every((row) => row.allianceName.includes(`Visible ${stamp}`)))
    assert.isFalse(searchRows.some((row) => row.allianceId === deleted.allianceId))
    assert.notProperty(searchRows[0], 'allianceContactPhone')

    const byInactive = await client.get(BASE_URL).qs({ search: stamp, active: 0 }).loginAs(admin!.user)
    byInactive.assertStatus(200)
    const inactiveRows = byInactive.body().data as Array<{ allianceId: number; allianceActive: number }>
    assert.isTrue(inactiveRows.some((row) => row.allianceId === inactive.allianceId))
    assert.isTrue(inactiveRows.every((row) => row.allianceActive === 0))

    const paged = await client
      .get(BASE_URL)
      .qs({ search: stamp, page: 1, limit: 1 })
      .loginAs(admin!.user)
    paged.assertStatus(200)
    assert.equal(paged.body().meta.page, 1)
    assert.equal(paged.body().meta.limit, 1)
    assert.isAtLeast(paged.body().meta.total, 2)
    assert.isAtLeast(paged.body().meta.lastPage, 2)
    assert.equal(paged.body().data.length, 1)
  })
})

test.group('GET/PATCH/estado /api/platform/alliances/:allianceId', (group) => {
  let admin: TestActor | null = null
  const createdIds: number[] = []

  group.setup(async () => {
    admin = await createActor('alliance-crud-item', true)
  })

  group.teardown(async () => {
    await cleanupAlliances(createdIds)
    await cleanupActor(admin)
  })

  test('8. detalle 200 con AllianceView', async ({ client, assert }) => {
    const alliance = await Alliance.create({
      allianceName: `Detalle ${Date.now()}`,
      allianceContactName: 'Carlos',
      allianceContactEmail: 'carlos@example.com',
      allianceContactPhone: '5550001111',
      allianceDefaultCommissionPercent: 9.25,
      allianceDefaultTermPeriods: 8,
      allianceActive: 1,
    })
    createdIds.push(alliance.allianceId)

    const response = await client.get(`${BASE_URL}/${alliance.allianceId}`).loginAs(admin!.user)
    response.assertStatus(200)
    const data = response.body().data
    assert.equal(data.allianceId, alliance.allianceId)
    assert.equal(data.allianceContactPhone, '5550001111')
    assert.equal(Number(data.allianceDefaultCommissionPercent), 9.25)
    assert.isString(data.createdAt)
    assert.property(data, 'updatedAt')
  })

  test('9. id inexistente o soft-deleted responde 404 NOT_FOUND en detalle, PATCH, activate y deactivate', async ({
    client,
  }) => {
    const missingId = 2_147_483_646
    const deleted = await Alliance.create({
      allianceName: `Soft deleted ${Date.now()}`,
      allianceContactName: null,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 5,
      allianceDefaultTermPeriods: null,
      allianceActive: 1,
    })
    await deleted.delete()
    createdIds.push(deleted.allianceId)

    for (const id of [missingId, deleted.allianceId]) {
      const show = await client.get(`${BASE_URL}/${id}`).loginAs(admin!.user)
      show.assertStatus(404)
      show.assertBodyContains({ code: ALLIANCE_ERROR_CODES.NOT_FOUND })

      const patch = await client
        .patch(`${BASE_URL}/${id}`)
        .loginAs(admin!.user)
        .json({ allianceName: 'No existe' })
      patch.assertStatus(404)
      patch.assertBodyContains({ code: ALLIANCE_ERROR_CODES.NOT_FOUND })

      const activate = await client.post(`${BASE_URL}/${id}/activate`).loginAs(admin!.user)
      activate.assertStatus(404)
      activate.assertBodyContains({ code: ALLIANCE_ERROR_CODES.NOT_FOUND })

      const deactivate = await client.post(`${BASE_URL}/${id}/deactivate`).loginAs(admin!.user)
      deactivate.assertStatus(404)
      deactivate.assertBodyContains({ code: ALLIANCE_ERROR_CODES.NOT_FOUND })
    }
  })

  test('10. PATCH actualiza comisión y plazo e ignora allianceActive', async ({ client, assert }) => {
    const alliance = await Alliance.create({
      allianceName: `Editable ${Date.now()}`,
      allianceContactName: null,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 10,
      allianceDefaultTermPeriods: 12,
      allianceActive: 1,
    })
    createdIds.push(alliance.allianceId)

    const response = await client
      .patch(`${BASE_URL}/${alliance.allianceId}`)
      .loginAs(admin!.user)
      .json({
        allianceDefaultCommissionPercent: 7.5,
        allianceDefaultTermPeriods: 3,
        allianceActive: 0,
      })

    response.assertStatus(200)
    const data = response.body().data
    assert.equal(Number(data.allianceDefaultCommissionPercent), 7.5)
    assert.equal(data.allianceDefaultTermPeriods, 3)
    assert.equal(data.allianceActive, 1)

    await alliance.refresh()
    assert.equal(alliance.allianceActive, 1)
  })

  test('11. desactivar conserva condiciones; el segundo deactivate responde ALREADY_INACTIVE', async ({
    client,
    assert,
  }) => {
    const alliance = await Alliance.create({
      allianceName: `A desactivar ${Date.now()}`,
      allianceContactName: 'Eva',
      allianceContactEmail: 'eva@example.com',
      allianceContactPhone: '5559990000',
      allianceDefaultCommissionPercent: 11,
      allianceDefaultTermPeriods: 24,
      allianceActive: 1,
    })
    createdIds.push(alliance.allianceId)

    const first = await client.post(`${BASE_URL}/${alliance.allianceId}/deactivate`).loginAs(admin!.user)
    first.assertStatus(200)
    const data = first.body().data
    assert.equal(data.allianceActive, 0)
    assert.equal(Number(data.allianceDefaultCommissionPercent), 11)
    assert.equal(data.allianceDefaultTermPeriods, 24)
    assert.equal(data.allianceContactName, 'Eva')

    const second = await client
      .post(`${BASE_URL}/${alliance.allianceId}/deactivate`)
      .loginAs(admin!.user)
    second.assertStatus(422)
    second.assertBodyContains({
      key: 'alianza-ya-inactiva',
      code: ALLIANCE_ERROR_CODES.ALREADY_INACTIVE,
    })
  })

  test('12. activate de una activa responde ALREADY_ACTIVE; de una inactiva responde 200', async ({
    client,
    assert,
  }) => {
    const alliance = await Alliance.create({
      allianceName: `A reactivar ${Date.now()}`,
      allianceContactName: null,
      allianceContactEmail: null,
      allianceContactPhone: null,
      allianceDefaultCommissionPercent: 4,
      allianceDefaultTermPeriods: null,
      allianceActive: 1,
    })
    createdIds.push(alliance.allianceId)

    const alreadyActive = await client
      .post(`${BASE_URL}/${alliance.allianceId}/activate`)
      .loginAs(admin!.user)
    alreadyActive.assertStatus(422)
    alreadyActive.assertBodyContains({
      key: 'alianza-ya-activa',
      code: ALLIANCE_ERROR_CODES.ALREADY_ACTIVE,
    })

    await client.post(`${BASE_URL}/${alliance.allianceId}/deactivate`).loginAs(admin!.user)
    const reactivated = await client
      .post(`${BASE_URL}/${alliance.allianceId}/activate`)
      .loginAs(admin!.user)
    reactivated.assertStatus(200)
    assert.equal(reactivated.body().data.allianceActive, 1)
  })
})

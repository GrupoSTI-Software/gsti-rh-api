import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Alliance from '#models/alliance'
import AllianceAttribution from '#models/alliance_attribution'
import { ALLIANCE_ERROR_CODES, ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import { toBusinessDateString } from '#utils/business_date'

/**
 * Tests funcionales — atribuir un cliente a una alianza
 * (USRH1789099318034). Alta, consulta, unicidad viva, carrera y UNIQUE.
 */

const TEST_PASSWORD = 'AllianceAttributionTest123!'
const BASE = '/api/platform/alliance-attributions'

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

interface MysqlErrorShape {
  code?: string
  sqlMessage?: string
  original?: { code?: string; sqlMessage?: string }
  cause?: { code?: string; sqlMessage?: string }
}

function mysqlError(error: unknown): { code?: string; sqlMessage: string } {
  const err = error as MysqlErrorShape
  const inner = err.original ?? err.cause ?? err
  return {
    code: inner.code ?? err.code,
    sqlMessage: inner.sqlMessage ?? err.sqlMessage ?? (error instanceof Error ? error.message : ''),
  }
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Attribution',
    personLastname: 'Http',
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
    businessUnitName: `Attribution HTTP BU ${stamp}`,
    businessUnitSlug: `attribution-http-bu-${stamp}`,
    businessUnitLegalName: `Attribution HTTP Legal ${stamp}`,
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

async function createClientUnit(label: string): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  return BusinessUnit.create({
    businessUnitName: `Cliente ${label} ${stamp}`,
    businessUnitSlug: `attr-client-${label}-${stamp}`,
    businessUnitLegalName: `Cliente ${label} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createAlliance(params: {
  name: string
  percent: number
  term: number | null
  active?: 0 | 1
}): Promise<Alliance> {
  return Alliance.create({
    allianceName: params.name,
    allianceContactName: null,
    allianceContactEmail: null,
    allianceContactPhone: null,
    allianceDefaultCommissionPercent: params.percent,
    allianceDefaultTermPeriods: params.term,
    allianceActive: params.active ?? 1,
  })
}

function historyUrl(publicId: string): string {
  return `/api/platform/tenants/${publicId}/alliance-attributions`
}

function assertNoInternalId(body: unknown, assert: { notInclude: (hay: string, n: string) => void }) {
  const raw = JSON.stringify(body)
  assert.notInclude(raw, '"businessUnitId"')
  assert.notInclude(raw, '"business_unit_id"')
}

test.group('POST /api/platform/alliance-attributions — alta', (group) => {
  let admin: TestActor | null = null
  const allianceIds: number[] = []
  const attributionIds: number[] = []
  const clientUnitIds: number[] = []

  group.setup(async () => {
    admin = await createActor('attr-store', true)
  })

  group.teardown(async () => {
    if (attributionIds.length > 0) {
      await AllianceAttribution.query()
        .whereIn('alliance_attribution_id', attributionIds)
        .delete()
    }
    if (allianceIds.length > 0) {
      await Alliance.query().whereIn('alliance_id', allianceIds).delete()
    }
    if (clientUnitIds.length > 0) {
      await BusinessUnit.query().whereIn('business_unit_id', clientUnitIds).delete()
    }
    await cleanupActor(admin)
  })

  test('CA-1: hereda 15 % y 12 periodos y queda viva', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Alianza hereda ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('hereda')
    clientUnitIds.push(unit.businessUnitId)

    const startsAt = '2024-03-01'
    const response = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: startsAt,
      })

    response.assertStatus(201)
    const data = response.body().data
    attributionIds.push(data.allianceAttributionId)
    assert.equal(response.body().type, 'success')
    assert.equal(Number(data.allianceAttributionCommissionPercent), 15)
    assert.equal(data.allianceAttributionTermPeriods, 12)
    assert.equal(data.allianceAttributionStartsAt, startsAt)
    assert.isTrue(data.allianceAttributionIsLive)
    assert.isNull(data.allianceAttributionClosedAt)
    assert.isNull(data.allianceAttributionCloseReason)
    assert.equal(data.allianceName, alliance.allianceName)
    assert.equal(data.businessUnitPublicId, unit.businessUnitPublicId)
    assert.equal(data.businessUnitName, unit.businessUnitName)
    assertNoInternalId(response.body(), assert)

    const row = await AllianceAttribution.findOrFail(data.allianceAttributionId)
    assert.isNull(row.allianceAttributionClosedAt)
  })

  test('CA-2: condiciones propias en un solo POST y no toca el acuerdo general', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Alianza propia ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('propia')
    clientUnitIds.push(unit.businessUnitId)

    const response = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
        allianceAttributionCommissionPercent: 20,
        allianceAttributionTermPeriods: 6,
      })

    response.assertStatus(201)
    const data = response.body().data
    attributionIds.push(data.allianceAttributionId)
    assert.equal(Number(data.allianceAttributionCommissionPercent), 20)
    assert.equal(data.allianceAttributionTermPeriods, 6)

    await alliance.refresh()
    assert.equal(Number(alliance.allianceDefaultCommissionPercent), 15)
    assert.equal(alliance.allianceDefaultTermPeriods, 12)
  })

  test('CA-3: plazo ausente hereda, null deja indeterminado, número fija', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Alianza plazos ${Date.now()}`,
      percent: 10,
      term: 8,
    })
    allianceIds.push(alliance.allianceId)

    const inheritUnit = await createClientUnit('plazo-hereda')
    const nullUnit = await createClientUnit('plazo-null')
    const numberUnit = await createClientUnit('plazo-num')
    clientUnitIds.push(inheritUnit.businessUnitId, nullUnit.businessUnitId, numberUnit.businessUnitId)

    const inherited = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: inheritUnit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    inherited.assertStatus(201)
    attributionIds.push(inherited.body().data.allianceAttributionId)
    assert.equal(inherited.body().data.allianceAttributionTermPeriods, 8)

    const explicitNull = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: nullUnit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
        allianceAttributionTermPeriods: null,
      })
    explicitNull.assertStatus(201)
    attributionIds.push(explicitNull.body().data.allianceAttributionId)
    assert.isNull(explicitNull.body().data.allianceAttributionTermPeriods)

    const numbered = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: numberUnit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
        allianceAttributionTermPeriods: 3,
      })
    numbered.assertStatus(201)
    attributionIds.push(numbered.body().data.allianceAttributionId)
    assert.equal(numbered.body().data.allianceAttributionTermPeriods, 3)
  })

  test('CA-4: segunda atribución viva responde 409 y deja una sola fila viva', async ({
    client,
    assert,
  }) => {
    const firstAlliance = await createAlliance({
      name: `Alianza primera ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    const otherAlliance = await createAlliance({
      name: `Alianza otra ${Date.now()}`,
      percent: 8,
      term: 6,
    })
    allianceIds.push(firstAlliance.allianceId, otherAlliance.allianceId)
    const unit = await createClientUnit('segunda')
    clientUnitIds.push(unit.businessUnitId)

    const first = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: firstAlliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    first.assertStatus(201)
    attributionIds.push(first.body().data.allianceAttributionId)

    const second = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: otherAlliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    second.assertStatus(409)
    assert.equal(second.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_ALREADY_LIVE)
    assert.equal(second.body().key, ALLIANCE_ERRORS.ATTRIBUTION_ALREADY_LIVE.key)
    assert.equal(second.body().detail, ALLIANCE_ERRORS.ATTRIBUTION_ALREADY_LIVE.detail)

    const live = await AllianceAttribution.query()
      .where('business_unit_id', unit.businessUnitId)
      .whereNull('alliance_attribution_closed_at')
    assert.equal(live.length, 1)
  })

  test('CA-5: dos POST simultáneos dejan una viva y la otra 409', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Alianza carrera ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('carrera')
    clientUnitIds.push(unit.businessUnitId)

    const payload = {
      allianceId: alliance.allianceId,
      businessUnitPublicId: unit.businessUnitPublicId,
      allianceAttributionStartsAt: toBusinessDateString(),
    }

    const [a, b] = await Promise.all([
      client.post(BASE).loginAs(admin!.user).json(payload),
      client.post(BASE).loginAs(admin!.user).json(payload),
    ])

    const statuses = [a.status(), b.status()].sort()
    assert.deepEqual(statuses, [201, 409])

    const winner = a.status() === 201 ? a : b
    const loser = a.status() === 409 ? a : b
    attributionIds.push(winner.body().data.allianceAttributionId)
    assert.equal(loser.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_ALREADY_LIVE)
    assert.equal(loser.body().key, ALLIANCE_ERRORS.ATTRIBUTION_ALREADY_LIVE.key)

    const live = await AllianceAttribution.query()
      .where('business_unit_id', unit.businessUnitId)
      .whereNull('alliance_attribution_closed_at')
    assert.equal(live.length, 1)
  })

  test('CA-7: alianza inactiva responde 422 INACTIVE y no crea', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Alianza inactiva ${Date.now()}`,
      percent: 15,
      term: 12,
      active: 0,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('inactiva')
    clientUnitIds.push(unit.businessUnitId)

    const response = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })

    response.assertStatus(422)
    assert.equal(response.body().code, ALLIANCE_ERROR_CODES.INACTIVE)
    const rows = await AllianceAttribution.query().where('business_unit_id', unit.businessUnitId)
    assert.equal(rows.length, 0)
  })

  test('CA-8: alianza o cliente inexistentes responden 404 distintos', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Alianza 404 ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('404')
    clientUnitIds.push(unit.businessUnitId)

    const missingAlliance = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: 2_147_483_647,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    missingAlliance.assertStatus(404)
    assert.equal(missingAlliance.body().code, ALLIANCE_ERROR_CODES.NOT_FOUND)

    const missingUnit = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: '00000000-0000-4000-8000-000000000099',
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    missingUnit.assertStatus(404)
    assert.equal(missingUnit.body().code, ALLIANCE_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND)
  })

  test('CA-9: fecha futura 422; fecha pasada se acepta', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Alianza fechas ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const futureUnit = await createClientUnit('futuro')
    const pastUnit = await createClientUnit('pasado')
    clientUnitIds.push(futureUnit.businessUnitId, pastUnit.businessUnitId)

    const tomorrow = DateTime.fromISO(toBusinessDateString()).plus({ days: 1 }).toISODate()!
    const future = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: futureUnit.businessUnitPublicId,
        allianceAttributionStartsAt: tomorrow,
      })
    future.assertStatus(422)
    assert.equal(future.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_START_IN_FUTURE)

    const past = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: pastUnit.businessUnitPublicId,
        allianceAttributionStartsAt: '2020-06-15',
      })
    past.assertStatus(201)
    attributionIds.push(past.body().data.allianceAttributionId)
    assert.equal(past.body().data.allianceAttributionStartsAt, '2020-06-15')
  })

  test('fecha con forma YYYY-MM-DD pero día imposible responde 422 VAL_INPUT, no 500', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Alianza fecha imposible ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('fecha-imposible')
    clientUnitIds.push(unit.businessUnitId)

    const impossible = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: '2026-02-31',
      })
    impossible.assertStatus(422)
    assert.equal(impossible.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)
  })

  test('allianceId booleano o arreglo no crea atribución', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Alianza scalar ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unitA = await createClientUnit('scalar-a')
    const unitB = await createClientUnit('scalar-b')
    clientUnitIds.push(unitA.businessUnitId, unitB.businessUnitId)

    const asArray = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: [alliance.allianceId],
        businessUnitPublicId: unitA.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    asArray.assertStatus(422)
    assert.equal(asArray.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)

    const asBoolean = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: true,
        businessUnitPublicId: unitB.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    asBoolean.assertStatus(422)
    assert.equal(asBoolean.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)

    const leftover = await AllianceAttribution.query()
      .whereIn('business_unit_id', [unitA.businessUnitId, unitB.businessUnitId])
    assert.equal(leftover.length, 0)
  })

  test('CA-10: comisión y plazo inválidos reutilizan los code de la HU 01', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Alianza rango ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unitA = await createClientUnit('rango-a')
    const unitB = await createClientUnit('rango-b')
    clientUnitIds.push(unitA.businessUnitId, unitB.businessUnitId)

    const decimals = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unitA.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
        allianceAttributionCommissionPercent: 10.123,
      })
    decimals.assertStatus(422)
    assert.equal(decimals.body().code, ALLIANCE_ERROR_CODES.COMMISSION_OUT_OF_RANGE)

    const over = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unitA.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
        allianceAttributionCommissionPercent: 120,
      })
    over.assertStatus(422)
    assert.equal(over.body().code, ALLIANCE_ERROR_CODES.COMMISSION_OUT_OF_RANGE)

    const zeroTerm = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unitB.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
        allianceAttributionTermPeriods: 0,
      })
    zeroTerm.assertStatus(422)
    assert.equal(zeroTerm.body().code, ALLIANCE_ERROR_CODES.TERM_PERIODS_INVALID)
  })

  test('corregir el acuerdo general no altera la atribución ya creada', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Alianza congelada ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('congelada')
    clientUnitIds.push(unit.businessUnitId)

    const created = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    created.assertStatus(201)
    attributionIds.push(created.body().data.allianceAttributionId)

    alliance.allianceDefaultCommissionPercent = 14
    alliance.allianceDefaultTermPeriods = 24
    await alliance.save()

    const shown = await client
      .get(`${BASE}/${created.body().data.allianceAttributionId}`)
      .loginAs(admin!.user)
    shown.assertStatus(200)
    assert.equal(Number(shown.body().data.allianceAttributionCommissionPercent), 15)
    assert.equal(shown.body().data.allianceAttributionTermPeriods, 12)
  })
})

test.group('GET atribución e histórico', (group) => {
  let admin: TestActor | null = null
  const allianceIds: number[] = []
  const attributionIds: number[] = []
  const clientUnitIds: number[] = []

  group.setup(async () => {
    admin = await createActor('attr-get', true)
  })

  group.teardown(async () => {
    if (attributionIds.length > 0) {
      await AllianceAttribution.query()
        .whereIn('alliance_attribution_id', attributionIds)
        .delete()
    }
    if (allianceIds.length > 0) {
      await Alliance.query().whereIn('alliance_id', allianceIds).delete()
    }
    if (clientUnitIds.length > 0) {
      await BusinessUnit.query().whereIn('business_unit_id', clientUnitIds).delete()
    }
    await cleanupActor(admin)
  })

  test('CA-11: GET por id 200; id inexistente 404 ATTRIBUTION_NOT_FOUND', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Alianza show ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('show')
    clientUnitIds.push(unit.businessUnitId)

    const created = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    created.assertStatus(201)
    const id = created.body().data.allianceAttributionId as number
    attributionIds.push(id)

    const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
    shown.assertStatus(200)
    assert.equal(shown.body().data.allianceAttributionId, id)
    assert.equal(shown.body().data.allianceName, alliance.allianceName)
    assertNoInternalId(shown.body(), assert)

    const missing = await client.get(`${BASE}/2147483646`).loginAs(admin!.user)
    missing.assertStatus(404)
    assert.equal(missing.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_NOT_FOUND)

    const scientific = await client.get(`${BASE}/1e2`).loginAs(admin!.user)
    scientific.assertStatus(404)
    assert.equal(scientific.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_NOT_FOUND)
  })

  test('CA-12: histórico con una atribución, vacío 200, publicId inexistente 404', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Alianza hist ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const withAttr = await createClientUnit('hist-con')
    const withoutAttr = await createClientUnit('hist-sin')
    clientUnitIds.push(withAttr.businessUnitId, withoutAttr.businessUnitId)

    const created = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: withAttr.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    created.assertStatus(201)
    attributionIds.push(created.body().data.allianceAttributionId)

    const listed = await client.get(historyUrl(withAttr.businessUnitPublicId)).loginAs(admin!.user)
    listed.assertStatus(200)
    assert.isArray(listed.body().data)
    assert.equal(listed.body().data.length, 1)
    assert.isTrue(listed.body().data[0].allianceAttributionIsLive)
    assertNoInternalId(listed.body(), assert)

    const empty = await client.get(historyUrl(withoutAttr.businessUnitPublicId)).loginAs(admin!.user)
    empty.assertStatus(200)
    assert.deepEqual(empty.body().data, [])

    const missing = await client
      .get(historyUrl('00000000-0000-4000-8000-000000000098'))
      .loginAs(admin!.user)
    missing.assertStatus(404)
    assert.equal(missing.body().code, ALLIANCE_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND)

    const slug = await client.get(historyUrl('sae')).loginAs(admin!.user)
    slug.assertStatus(404)
    assert.equal(slug.body().code, ALLIANCE_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND)
  })
})

test.group('CA-6 — UNIQUE de la atribución viva en BD', (group) => {
  const allianceIds: number[] = []
  const attributionIds: number[] = []
  const clientUnitIds: number[] = []

  group.teardown(async () => {
    if (attributionIds.length > 0) {
      await AllianceAttribution.query()
        .whereIn('alliance_attribution_id', attributionIds)
        .delete()
    }
    if (allianceIds.length > 0) {
      await Alliance.query().whereIn('alliance_id', allianceIds).delete()
    }
    if (clientUnitIds.length > 0) {
      await BusinessUnit.query().whereIn('business_unit_id', clientUnitIds).delete()
    }
  })

  test('AllianceAttribution.create directo revienta con ER_DUP_ENTRY del índice vivo', async ({
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Alianza unique ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('unique')
    clientUnitIds.push(unit.businessUnitId)

    const first = await AllianceAttribution.create({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      allianceAttributionCommissionPercent: 15,
      allianceAttributionTermPeriods: 12,
      allianceAttributionStartsAt: DateTime.fromISO('2024-01-01', { zone: 'utc' }),
      allianceAttributionClosedAt: null,
      allianceAttributionCloseReason: null,
    })
    attributionIds.push(first.allianceAttributionId)

    let caught: unknown = null
    try {
      await AllianceAttribution.create({
        allianceId: alliance.allianceId,
        businessUnitId: unit.businessUnitId,
        allianceAttributionCommissionPercent: 20,
        allianceAttributionTermPeriods: 6,
        allianceAttributionStartsAt: DateTime.fromISO('2024-02-01', { zone: 'utc' }),
        allianceAttributionClosedAt: null,
        allianceAttributionCloseReason: null,
      })
      assert.fail('El UNIQUE debió rechazar la segunda atribución viva')
    } catch (error) {
      caught = error
    }

    const parsed = mysqlError(caught)
    assert.equal(parsed.code, 'ER_DUP_ENTRY')
    assert.include(parsed.sqlMessage, 'alliance_attributions_business_unit_live_unique')

    const live = await AllianceAttribution.query()
      .where('business_unit_id', unit.businessUnitId)
      .whereNull('alliance_attribution_closed_at')
    assert.equal(live.length, 1)
  })
})

import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Alliance from '#models/alliance'
import AllianceAttribution from '#models/alliance_attribution'
import { ALLIANCE_ERROR_CODES } from '#constants/alliance_error_codes'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'

/**
 * Tests funcionales — ajustar, cerrar y contar atribuciones
 * (USRH1789099318113).
 */

const TEST_PASSWORD = 'AllianceAttributionLife123!'
const BASE = '/api/platform/alliance-attributions'

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
    personFirstname: 'Life',
    personLastname: 'Attribution',
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
    businessUnitName: `Life BU ${stamp}`,
    businessUnitSlug: `life-bu-${stamp}`,
    businessUnitLegalName: `Life Legal ${stamp}`,
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
    businessUnitName: `Life cliente ${label} ${stamp}`,
    businessUnitSlug: `life-client-${label}-${stamp}`,
    businessUnitLegalName: `Life cliente Legal ${stamp}`,
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

test.group('PATCH y close de atribución', (group) => {
  let admin: TestActor | null = null
  const allianceIds: number[] = []
  const attributionIds: number[] = []
  const clientUnitIds: number[] = []

  group.setup(async () => {
    admin = await createActor('attr-life', true)
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

  test('CA-1: PATCH cambia la atribución y no el acuerdo general', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Life hereda ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('patch')
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

    const patched = await client
      .patch(`${BASE}/${id}`)
      .loginAs(admin!.user)
      .json({ allianceAttributionCommissionPercent: 18 })
    patched.assertStatus(200)
    assert.equal(Number(patched.body().data.allianceAttributionCommissionPercent), 18)
    assert.equal(patched.body().data.allianceAttributionTermPeriods, 12)

    await alliance.refresh()
    assert.equal(Number(alliance.allianceDefaultCommissionPercent), 15)
    assert.equal(alliance.allianceDefaultTermPeriods, 12)
  })

  test('CA-2: PATCH con allianceId o businessUnitPublicId es 422', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Life dueño ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('owner')
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

    const withAlliance = await client
      .patch(`${BASE}/${id}`)
      .loginAs(admin!.user)
      .json({ allianceId: alliance.allianceId + 1, allianceAttributionCommissionPercent: 10 })
    withAlliance.assertStatus(422)
    assert.equal(withAlliance.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)

    const withUnit = await client
      .patch(`${BASE}/${id}`)
      .loginAs(admin!.user)
      .json({
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionCommissionPercent: 10,
      })
    withUnit.assertStatus(422)
    assert.equal(withUnit.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)

    const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
    assert.equal(Number(shown.body().data.allianceAttributionCommissionPercent), 15)
    assert.equal(shown.body().data.allianceId, alliance.allianceId)
  })

  test('CA-2b: se corrige startsAt; futuro reutiliza el code del alta', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Life fecha ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('starts')
    clientUnitIds.push(unit.businessUnitId)

    const created = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: '2025-08-01',
      })
    created.assertStatus(201)
    const id = created.body().data.allianceAttributionId as number
    attributionIds.push(id)

    const corrected = await client
      .patch(`${BASE}/${id}`)
      .loginAs(admin!.user)
      .json({ allianceAttributionStartsAt: '2026-08-01' })
    corrected.assertStatus(200)
    assert.equal(corrected.body().data.allianceAttributionStartsAt, '2026-08-01')
    assert.isTrue(corrected.body().data.allianceAttributionIsLive)

    const tomorrow = DateTime.fromISO(toBusinessDateString()).plus({ days: 1 }).toISODate()!
    const future = await client
      .patch(`${BASE}/${id}`)
      .loginAs(admin!.user)
      .json({ allianceAttributionStartsAt: tomorrow })
    future.assertStatus(422)
    assert.equal(future.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_START_IN_FUTURE)

    const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
    assert.equal(shown.body().data.allianceAttributionStartsAt, '2026-08-01')
  })

  test('PATCH reutiliza los codes de comisión y plazo del alta', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Life rango ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('range')
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

    const percent = await client
      .patch(`${BASE}/${id}`)
      .loginAs(admin!.user)
      .json({ allianceAttributionCommissionPercent: 120 })
    percent.assertStatus(422)
    assert.equal(percent.body().code, ALLIANCE_ERROR_CODES.COMMISSION_OUT_OF_RANGE)

    const term = await client
      .patch(`${BASE}/${id}`)
      .loginAs(admin!.user)
      .json({ allianceAttributionTermPeriods: 0 })
    term.assertStatus(422)
    assert.equal(term.body().code, ALLIANCE_ERROR_CODES.TERM_PERIODS_INVALID)

    const missing = await client.patch(`${BASE}/999999001`).loginAs(admin!.user).json({
      allianceAttributionCommissionPercent: 10,
    })
    missing.assertStatus(404)
    assert.equal(missing.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_NOT_FOUND)
  })

  test('CA-3 y CA-7: cerrada no se ajusta ni se vuelve a cerrar', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Life inmut ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('immut')
    clientUnitIds.push(unit.businessUnitId)

    const created = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: '2026-01-01',
      })
    created.assertStatus(201)
    const id = created.body().data.allianceAttributionId as number
    attributionIds.push(id)

    const closed = await client
      .post(`${BASE}/${id}/close`)
      .loginAs(admin!.user)
      .json({
        allianceAttributionClosedAt: '2026-03-01',
        allianceAttributionCloseReason: 'Terminó el acuerdo',
      })
    closed.assertStatus(200)
    assert.isFalse(closed.body().data.allianceAttributionIsLive)
    assert.equal(closed.body().data.allianceAttributionCloseReason, 'Terminó el acuerdo')

    const patchClosed = await client
      .patch(`${BASE}/${id}`)
      .loginAs(admin!.user)
      .json({ allianceAttributionCommissionPercent: 9 })
    patchClosed.assertStatus(409)
    assert.equal(patchClosed.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_CLOSED_IMMUTABLE)

    const reclose = await client
      .post(`${BASE}/${id}/close`)
      .loginAs(admin!.user)
      .json({
        allianceAttributionClosedAt: toBusinessDateString(),
        allianceAttributionCloseReason: 'Otro motivo',
      })
    reclose.assertStatus(422)
    assert.equal(reclose.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_ALREADY_CLOSED)

    const row = await AllianceAttribution.findOrFail(id)
    assert.equal(Number(row.allianceAttributionCommissionPercent), 15)
    assert.equal(row.allianceAttributionCloseReason, 'Terminó el acuerdo')
    assert.equal(toCalendarIsoDate(row.allianceAttributionClosedAt), '2026-03-01')
  })

  test('CA-4: alianza inactiva permite PATCH y close', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Life inactiva ${Date.now()}`,
      percent: 15,
      term: 12,
      active: 0,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('inactive')
    clientUnitIds.push(unit.businessUnitId)

    const row = await AllianceAttribution.create({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      allianceAttributionCommissionPercent: 15,
      allianceAttributionTermPeriods: 12,
      allianceAttributionStartsAt: DateTime.fromISO('2026-01-01', { zone: 'utc' }),
      allianceAttributionClosedAt: null,
      allianceAttributionCloseReason: null,
    })
    attributionIds.push(row.allianceAttributionId)

    const patched = await client
      .patch(`${BASE}/${row.allianceAttributionId}`)
      .loginAs(admin!.user)
      .json({ allianceAttributionCommissionPercent: 11 })
    patched.assertStatus(200)
    assert.equal(Number(patched.body().data.allianceAttributionCommissionPercent), 11)

    const closed = await client
      .post(`${BASE}/${row.allianceAttributionId}/close`)
      .loginAs(admin!.user)
      .json({
        allianceAttributionClosedAt: '2026-02-01',
        allianceAttributionCloseReason: 'Salida con alianza inactiva',
      })
    closed.assertStatus(200)
    assert.isFalse(closed.body().data.allianceAttributionIsLive)
  })

  test('CA-5 y CA-9: close libera el slot y solo toca cierre', async ({ client, assert }) => {
    const first = await createAlliance({
      name: `Life slot A ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    const second = await createAlliance({
      name: `Life slot B ${Date.now()}`,
      percent: 8,
      term: 6,
    })
    allianceIds.push(first.allianceId, second.allianceId)
    const unit = await createClientUnit('slot')
    clientUnitIds.push(unit.businessUnitId)

    const created = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: first.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: '2026-01-15',
      })
    created.assertStatus(201)
    const id = created.body().data.allianceAttributionId as number
    attributionIds.push(id)

    const before = await AllianceAttribution.findOrFail(id)
    const frozen = {
      allianceId: before.allianceId,
      businessUnitId: before.businessUnitId,
      percent: Number(before.allianceAttributionCommissionPercent),
      term: before.allianceAttributionTermPeriods,
      startsAt: before.allianceAttributionStartsAt.toISODate(),
      createdAt: before.createdAt.toISO(),
    }

    const closed = await client
      .post(`${BASE}/${id}/close`)
      .loginAs(admin!.user)
      .json({
        allianceAttributionClosedAt: '2026-04-01',
        allianceAttributionCloseReason: 'Cambio de intermediario',
      })
    closed.assertStatus(200)
    assert.isFalse(closed.body().data.allianceAttributionIsLive)

    const after = await AllianceAttribution.findOrFail(id)
    assert.equal(after.allianceId, frozen.allianceId)
    assert.equal(after.businessUnitId, frozen.businessUnitId)
    assert.equal(Number(after.allianceAttributionCommissionPercent), frozen.percent)
    assert.equal(after.allianceAttributionTermPeriods, frozen.term)
    assert.equal(after.allianceAttributionStartsAt.toISODate(), frozen.startsAt)
    assert.equal(after.createdAt.toISO(), frozen.createdAt)
    assert.isNotNull(after.allianceAttributionClosedAt)
    assert.equal(after.allianceAttributionCloseReason, 'Cambio de intermediario')

    const reattributed = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: second.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
    reattributed.assertStatus(201)
    attributionIds.push(reattributed.body().data.allianceAttributionId)
    assert.equal(reattributed.body().data.allianceId, second.allianceId)
  })

  test('CA-6: close sin motivo deja la atribución viva', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Life motivo ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('reason')
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

    const empty = await client
      .post(`${BASE}/${id}/close`)
      .loginAs(admin!.user)
      .json({
        allianceAttributionClosedAt: toBusinessDateString(),
        allianceAttributionCloseReason: '   ',
      })
    empty.assertStatus(422)
    assert.equal(empty.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)

    const missing = await client
      .post(`${BASE}/${id}/close`)
      .loginAs(admin!.user)
      .json({ allianceAttributionClosedAt: toBusinessDateString() })
    missing.assertStatus(422)

    const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
    assert.isTrue(shown.body().data.allianceAttributionIsLive)
  })

  test('CA-7 concurrente: un close 200 y el otro 422 sin sobrescribir', async ({
    client,
    assert,
  }) => {
    const alliance = await createAlliance({
      name: `Life race ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('race')
    clientUnitIds.push(unit.businessUnitId)

    const created = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: '2026-01-01',
      })
    created.assertStatus(201)
    const id = created.body().data.allianceAttributionId as number
    attributionIds.push(id)

    const [first, second] = await Promise.all([
      client.post(`${BASE}/${id}/close`).loginAs(admin!.user).json({
        allianceAttributionClosedAt: '2026-02-01',
        allianceAttributionCloseReason: 'Ganador',
      }),
      client.post(`${BASE}/${id}/close`).loginAs(admin!.user).json({
        allianceAttributionClosedAt: '2026-03-01',
        allianceAttributionCloseReason: 'Perdedor',
      }),
    ])

    const statuses = [first.status(), second.status()].sort()
    assert.deepEqual(statuses, [200, 422])
    const winner = first.status() === 200 ? first : second
    const loser = first.status() === 422 ? first : second
    assert.equal(loser.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_ALREADY_CLOSED)
    const winnerReason = winner.body().data.allianceAttributionCloseReason as string
    assert.oneOf(winnerReason, ['Ganador', 'Perdedor'])

    const row = await AllianceAttribution.findOrFail(id)
    assert.equal(row.allianceAttributionCloseReason, winnerReason)
  })

  test('CA-8: fecha de cierre fuera de rango', async ({ client, assert }) => {
    const alliance = await createAlliance({
      name: `Life cierre fecha ${Date.now()}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('closedate')
    clientUnitIds.push(unit.businessUnitId)

    const created = await client
      .post(BASE)
      .loginAs(admin!.user)
      .json({
        allianceId: alliance.allianceId,
        businessUnitPublicId: unit.businessUnitPublicId,
        allianceAttributionStartsAt: '2026-06-01',
      })
    created.assertStatus(201)
    const id = created.body().data.allianceAttributionId as number
    attributionIds.push(id)

    const beforeStart = await client
      .post(`${BASE}/${id}/close`)
      .loginAs(admin!.user)
      .json({
        allianceAttributionClosedAt: '2026-05-01',
        allianceAttributionCloseReason: 'Antes de startsAt',
      })
    beforeStart.assertStatus(422)
    assert.equal(beforeStart.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_CLOSE_DATE_INVALID)

    const tomorrow = DateTime.fromISO(toBusinessDateString()).plus({ days: 1 }).toISODate()!
    const future = await client
      .post(`${BASE}/${id}/close`)
      .loginAs(admin!.user)
      .json({
        allianceAttributionClosedAt: tomorrow,
        allianceAttributionCloseReason: 'Futuro',
      })
    future.assertStatus(422)
    assert.equal(future.body().code, ALLIANCE_ERROR_CODES.ATTRIBUTION_CLOSE_DATE_INVALID)

    const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
    assert.isTrue(shown.body().data.allianceAttributionIsLive)
  })

  test('CA-10: el conteo va 0 → 1 → 0', async ({ client, assert }) => {
    const stamp = `${Date.now()}`
    const alliance = await createAlliance({
      name: `Life conteo ${stamp}`,
      percent: 15,
      term: 12,
    })
    allianceIds.push(alliance.allianceId)
    const unit = await createClientUnit('count')
    clientUnitIds.push(unit.businessUnitId)

    const empty = await client
      .get(`/api/platform/alliances/${alliance.allianceId}`)
      .loginAs(admin!.user)
    empty.assertStatus(200)
    assert.equal(empty.body().data.allianceLiveAttributionsCount, 0)

    const listedEmpty = await client
      .get('/api/platform/alliances')
      .qs({ search: `Life conteo ${stamp}` })
      .loginAs(admin!.user)
    listedEmpty.assertStatus(200)
    const emptyRow = (listedEmpty.body().data as Array<{ allianceId: number; allianceLiveAttributionsCount: number }>).find(
      (row) => row.allianceId === alliance.allianceId
    )
    assert.exists(emptyRow)
    assert.equal(emptyRow!.allianceLiveAttributionsCount, 0)

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

    const live = await client
      .get(`/api/platform/alliances/${alliance.allianceId}`)
      .loginAs(admin!.user)
    assert.equal(live.body().data.allianceLiveAttributionsCount, 1)

    const listedLive = await client
      .get('/api/platform/alliances')
      .qs({ search: `Life conteo ${stamp}` })
      .loginAs(admin!.user)
    const liveRow = (listedLive.body().data as Array<{ allianceId: number; allianceLiveAttributionsCount: number }>).find(
      (row) => row.allianceId === alliance.allianceId
    )
    assert.equal(liveRow!.allianceLiveAttributionsCount, 1)

    const closed = await client
      .post(`${BASE}/${created.body().data.allianceAttributionId}/close`)
      .loginAs(admin!.user)
      .json({
        allianceAttributionClosedAt: toBusinessDateString(),
        allianceAttributionCloseReason: 'Cierra el conteo',
      })
    closed.assertStatus(200)

    const after = await client
      .get(`/api/platform/alliances/${alliance.allianceId}`)
      .loginAs(admin!.user)
    assert.equal(after.body().data.allianceLiveAttributionsCount, 0)
  })
})

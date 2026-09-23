import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Alliance from '#models/alliance'
import AllianceAttribution from '#models/alliance_attribution'
import AllianceCommission from '#models/alliance_commission'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingPayment from '#models/billing_payment'
import BillingSubscription from '#models/billing_subscription'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { ALLIANCE_ERROR_CODES } from '#constants/alliance_error_codes'
import BillingCatalogService from '#services/billing_catalog_service'

/**
 * Listado de atribuciones por alianza (USRH1787719056819).
 * Orden discriminante, avance, paginación y aislamiento.
 */

const TEST_PASSWORD = 'AllianceByAlliance123!'
const LIST_BASE = '/api/platform/alliances'
const SHOW_BASE = '/api/platform/alliance-attributions'

interface TestActor {
  user: User
  person: Person
}

interface OrderFixture {
  alliance: Alliance
  otherAlliance: Alliance
  liveNewer: AllianceAttribution
  liveOlder: AllianceAttribution
  closedRecent: AllianceAttribution
  closedOlder: AllianceAttribution
  closedOlderUnit: BusinessUnit
  units: BusinessUnit[]
  otherAttribution: AllianceAttribution
}

async function withSqlLog<T>(work: () => Promise<T>): Promise<{ result: T; sqls: string[] }> {
  const sqls: string[] = []
  const knex = db.connection().getWriteClient()
  const onQuery = (query: { sql?: string }) => {
    if (query.sql) sqls.push(query.sql)
  }
  knex.on('query', onQuery)
  try {
    const result = await work()
    return { result, sqls }
  } finally {
    knex.off('query', onQuery)
  }
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'ByAlliance',
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
  return { user, person }
}

async function cleanupActor(actor: TestActor | null) {
  if (!actor) return
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function createClientUnit(label: string): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  return BusinessUnit.create({
    businessUnitName: `Cliente ${label} ${stamp}`,
    businessUnitSlug: `attr-by-all-${label}-${stamp}`,
    businessUnitLegalName: `Cliente ${label} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createAllianceRow(params: {
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

async function createAttribution(params: {
  allianceId: number
  businessUnitId: number
  percent: number
  term: number | null
  startsAt: string
  closedAt?: string | null
  closeReason?: string | null
}): Promise<AllianceAttribution> {
  return AllianceAttribution.create({
    allianceId: params.allianceId,
    businessUnitId: params.businessUnitId,
    allianceAttributionCommissionPercent: params.percent,
    allianceAttributionTermPeriods: params.term,
    allianceAttributionStartsAt: DateTime.fromISO(params.startsAt, { zone: 'utc' }),
    allianceAttributionClosedAt: params.closedAt
      ? DateTime.fromISO(params.closedAt, { zone: 'utc' })
      : null,
    allianceAttributionCloseReason: params.closeReason ?? null,
  })
}

function listUrl(allianceId: number | string, query = ''): string {
  return `${LIST_BASE}/${allianceId}/attributions${query}`
}

function assertNoInternalId(body: unknown, assert: { notInclude: (hay: string, n: string) => void }) {
  const raw = JSON.stringify(body)
  assert.notInclude(raw, '"businessUnitId"')
  assert.notInclude(raw, '"business_unit_id"')
}

function assertNoSqlLeak(body: unknown, assert: { notInclude: (hay: string, n: string) => void }) {
  const raw = JSON.stringify(body)
  assert.notInclude(raw, 'sql')
  assert.notInclude(raw, 'ER_')
}

async function cleanupAttributions(params: {
  allianceIds: number[]
  unitIds: number[]
  planId?: number
}) {
  if (params.allianceIds.length > 0) {
    await AllianceCommission.query().whereIn('alliance_id', params.allianceIds).delete()
  }
  if (params.unitIds.length > 0) {
    const subscriptions = await BillingSubscription.query()
      .withTrashed()
      .whereIn('business_unit_id', params.unitIds)
    for (const subscription of subscriptions) {
      await BillingPayment.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .delete()
      await subscription.forceDelete()
    }
    await AllianceAttribution.query().whereIn('business_unit_id', params.unitIds).delete()
    await BusinessUnit.query().withTrashed().whereIn('business_unit_id', params.unitIds).delete()
  }
  if (params.allianceIds.length > 0) {
    await Alliance.query().whereIn('alliance_id', params.allianceIds).delete()
  }
  if (params.planId) {
    await BillingVolumeTier.query().where('billing_plan_id', params.planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', params.planId).delete()
    const plan = await BillingPlan.find(params.planId)
    if (plan) {
      await plan.delete()
    }
  }
}

async function seedOrderFixture(): Promise<OrderFixture> {
  const stamp = Date.now()
  const alliance = await createAllianceRow({
    name: `Alianza orden ${stamp}`,
    percent: 10,
    term: 12,
  })
  const otherAlliance = await createAllianceRow({
    name: `Alianza otra ${stamp}`,
    percent: 8,
    term: 6,
  })

  const closedRecentUnit = await createClientUnit('cerrada-ago')
  const liveNewerUnit = await createClientUnit('viva-nueva')
  const liveOlderUnit = await createClientUnit('viva-vieja')
  const closedOlderUnit = await createClientUnit('cerrada-jul')
  const otherUnit = await createClientUnit('otra-alianza')

  const closedRecent = await createAttribution({
    allianceId: alliance.allianceId,
    businessUnitId: closedRecentUnit.businessUnitId,
    percent: 12.5,
    term: 12,
    startsAt: '2026-01-01',
    closedAt: '2026-08-15',
    closeReason: 'Terminó el acuerdo',
  })
  const liveOlder = await createAttribution({
    allianceId: alliance.allianceId,
    businessUnitId: liveOlderUnit.businessUnitId,
    percent: 8,
    term: 6,
    startsAt: '2026-02-01',
  })
  const liveNewer = await createAttribution({
    allianceId: alliance.allianceId,
    businessUnitId: liveNewerUnit.businessUnitId,
    percent: 10,
    term: 12,
    startsAt: '2026-03-01',
  })
  const closedOlder = await createAttribution({
    allianceId: alliance.allianceId,
    businessUnitId: closedOlderUnit.businessUnitId,
    percent: 9,
    term: 12,
    startsAt: '2026-01-15',
    closedAt: '2026-07-01',
    closeReason: 'Cambio de alianza',
  })
  const otherAttribution = await createAttribution({
    allianceId: otherAlliance.allianceId,
    businessUnitId: otherUnit.businessUnitId,
    percent: 7,
    term: 6,
    startsAt: '2026-04-01',
  })

  return {
    alliance,
    otherAlliance,
    liveNewer,
    liveOlder,
    closedRecent,
    closedOlder,
    closedOlderUnit,
    units: [closedRecentUnit, liveNewerUnit, liveOlderUnit, closedOlderUnit, otherUnit],
    otherAttribution,
  }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Alliance by-alliance plan ${stamp}`,
    billingPlanDescription: 'Fixture USRH1787719056819',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 200,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 0,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 20,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createSubscription(businessUnitId: number, billingPlanId: number) {
  const now = DateTime.now()
  const price = await BillingPlanPrice.query().where('billing_plan_id', billingPlanId).firstOrFail()

  return BillingSubscription.create({
    businessUnitId,
    billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: 'past_due',
    billingSubscriptionContractedUnitAmount: 200,
    billingSubscriptionContractedEmployees: 50,
    billingSubscriptionDiscountPercent: 20,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: 8_000,
    billingSubscriptionContractedTaxAmount: 1_280,
    billingSubscriptionContractedTotal: 9_280,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd: now,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnitId,
  })
}

async function addCommission(params: {
  allianceId: number
  attributionId: number
  businessUnitId: number
  subscriptionId: number
  periods: number
  amountCents: number
  paidOn: string
}): Promise<void> {
  const now = DateTime.now()
  const payment = await BillingPayment.create({
    billingSubscriptionId: params.subscriptionId,
    billingPaymentAmountCents: 928_000,
    billingPaymentPeriodAmountCents: 928_000,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: 800_000,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: 800_000,
    billingPaymentTaxAmountCents: 128_000,
    billingPaymentTotalCents: 928_000,
    billingPaymentDiscountPercent: 20,
    billingPaymentTaxRate: 0.16,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: `BYALL-${Date.now()}-${Math.random()}`,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: now,
    billingPaymentPeriodStart: now,
    billingPaymentPeriodEnd: now.plus({ months: 1 }),
  })

  await AllianceCommission.create({
    allianceId: params.allianceId,
    allianceAttributionId: params.attributionId,
    businessUnitId: params.businessUnitId,
    billingPaymentId: payment.billingPaymentId,
    allianceCommissionPeriods: params.periods,
    allianceCommissionBaseCents: 800_000 * params.periods,
    allianceCommissionPercent: 10,
    allianceCommissionAmountCents: params.amountCents,
    allianceCommissionPaidOn: DateTime.fromISO(params.paidOn, { zone: 'utc' }),
  })
}

test.group('GET /api/platform/alliances/:allianceId/attributions', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('attr-by-alliance', true)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  test('CA-1: lista por alianza en orden vivas y luego cierre reciente', async ({
    client,
    assert,
  }) => {
    const fixture = await seedOrderFixture()

    try {
      const response = await client
        .get(listUrl(fixture.alliance.allianceId))
        .loginAs(admin!.user)

      response.assertStatus(200)
      const body = response.body()
      assert.equal(body.type, 'success')
      assert.equal(body.data.length, 4)
      assert.deepEqual(
        body.data.map((row: { allianceAttributionId: number }) => row.allianceAttributionId),
        [
          fixture.liveNewer.allianceAttributionId,
          fixture.liveOlder.allianceAttributionId,
          fixture.closedRecent.allianceAttributionId,
          fixture.closedOlder.allianceAttributionId,
        ]
      )
      assert.deepEqual(body.meta, {
        total: 4,
        page: 1,
        limit: 20,
        lastPage: 1,
      })
      assertNoInternalId(body, assert)
    } finally {
      await cleanupAttributions({
        allianceIds: [fixture.alliance.allianceId, fixture.otherAlliance.allianceId],
        unitIds: fixture.units.map((unit) => unit.businessUnitId),
      })
    }
  })

  test('CA-2: el avance de cada fila coincide con la consulta por id', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Alianza avance ${stamp}`,
      percent: 10,
      term: 12,
    })
    const freshUnit = await createClientUnit('fresh')
    const indefiniteUnit = await createClientUnit('indef')
    const exhaustedUnit = await createClientUnit('agotada')
    const closedUnit = await createClientUnit('cerrada')
    const units = [freshUnit, indefiniteUnit, exhaustedUnit, closedUnit]

    try {
      const fresh = await createAttribution({
        allianceId: alliance.allianceId,
        businessUnitId: freshUnit.businessUnitId,
        percent: 10,
        term: 12,
        startsAt: '2026-03-01',
      })
      const indefinite = await createAttribution({
        allianceId: alliance.allianceId,
        businessUnitId: indefiniteUnit.businessUnitId,
        percent: 8,
        term: null,
        startsAt: '2026-04-01',
      })
      const exhausted = await createAttribution({
        allianceId: alliance.allianceId,
        businessUnitId: exhaustedUnit.businessUnitId,
        percent: 10,
        term: 2,
        startsAt: '2026-01-01',
      })
      const closed = await createAttribution({
        allianceId: alliance.allianceId,
        businessUnitId: closedUnit.businessUnitId,
        percent: 12,
        term: 12,
        startsAt: '2026-01-01',
        closedAt: '2026-08-15',
        closeReason: 'Fin del acuerdo',
      })

      const subscription = await createSubscription(exhaustedUnit.businessUnitId, planId)
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: exhausted.allianceAttributionId,
        businessUnitId: exhaustedUnit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 2,
        amountCents: 160_000,
        paidOn: '2026-03-01',
      })

      const listed = await client.get(listUrl(alliance.allianceId)).loginAs(admin!.user)
      listed.assertStatus(200)

      const byId = new Map(
        (listed.body().data as Array<{ allianceAttributionId: number }>).map((row) => [
          row.allianceAttributionId,
          row,
        ])
      )

      for (const attribution of [fresh, indefinite, exhausted, closed]) {
        const shown = await client
          .get(`${SHOW_BASE}/${attribution.allianceAttributionId}`)
          .loginAs(admin!.user)
        shown.assertStatus(200)
        const fromList = byId.get(attribution.allianceAttributionId) as Record<string, unknown>
        const fromShow = shown.body().data as Record<string, unknown>
        assert.equal(
          fromList.allianceAttributionAccruedPeriods,
          fromShow.allianceAttributionAccruedPeriods
        )
        assert.equal(
          fromList.allianceAttributionRemainingPeriods,
          fromShow.allianceAttributionRemainingPeriods
        )
        assert.equal(
          fromList.allianceAttributionIsAccruing,
          fromShow.allianceAttributionIsAccruing
        )
        assert.equal(
          fromList.allianceAttributionNotAccruingReason,
          fromShow.allianceAttributionNotAccruingReason
        )
        assert.equal(
          fromList.allianceAttributionAccruedAmountCents,
          fromShow.allianceAttributionAccruedAmountCents
        )
      }

      const freshRow = byId.get(fresh.allianceAttributionId) as Record<string, unknown>
      assert.equal(freshRow.allianceAttributionAccruedPeriods, 0)
      assert.equal(freshRow.allianceAttributionRemainingPeriods, 12)
      assert.isTrue(freshRow.allianceAttributionIsAccruing)
      assert.isNull(freshRow.allianceAttributionNotAccruingReason)
      assert.equal(freshRow.allianceAttributionAccruedAmountCents, 0)

      const indefiniteRow = byId.get(indefinite.allianceAttributionId) as Record<string, unknown>
      assert.isNull(indefiniteRow.allianceAttributionRemainingPeriods)

      const exhaustedRow = byId.get(exhausted.allianceAttributionId) as Record<string, unknown>
      assert.isFalse(exhaustedRow.allianceAttributionIsAccruing)
      assert.equal(exhaustedRow.allianceAttributionNotAccruingReason, 'term_exhausted')

      const closedRow = byId.get(closed.allianceAttributionId) as Record<string, unknown>
      assert.equal(closedRow.allianceAttributionNotAccruingReason, 'closed')
    } finally {
      await cleanupAttributions({
        allianceIds: [alliance.allianceId],
        unitIds: units.map((unit) => unit.businessUnitId),
        planId,
      })
    }
  })

  test('CA-3: alianza sin clientes responde 200 vacío, nunca 404', async ({ client, assert }) => {
    const alliance = await createAllianceRow({
      name: `Alianza vacía ${Date.now()}`,
      percent: 10,
      term: 12,
    })

    try {
      const response = await client.get(listUrl(alliance.allianceId)).loginAs(admin!.user)
      response.assertStatus(200)
      assert.deepEqual(response.body().data, [])
      assert.equal(response.body().meta.total, 0)
    } finally {
      await cleanupAttributions({ allianceIds: [alliance.allianceId], unitIds: [] })
    }
  })

  test('CA-4: alianza inexistente, retirada o id no positivo responde 404', async ({
    client,
    assert,
  }) => {
    const alliance = await createAllianceRow({
      name: `Alianza retirada ${Date.now()}`,
      percent: 10,
      term: 12,
    })
    await alliance.delete()

    const cases = ['abc', '0', '-1', String(alliance.allianceId), '999999991']
    try {
      for (const allianceId of cases) {
        const response = await client.get(listUrl(allianceId)).loginAs(admin!.user)
        response.assertStatus(404)
        assert.equal(response.body().code, ALLIANCE_ERROR_CODES.NOT_FOUND)
        assertNoSqlLeak(response.body(), assert)
      }
    } finally {
      await Alliance.query().withTrashed().where('alliance_id', alliance.allianceId).delete()
    }
  })

  test('CA-5: page o limit fuera de rango responden 422', async ({ client, assert }) => {
    const alliance = await createAllianceRow({
      name: `Alianza query ${Date.now()}`,
      percent: 10,
      term: 12,
    })

    try {
      for (const query of [{ limit: 101 }, { limit: 0 }, { page: 0 }]) {
        const response = await client
          .get(listUrl(alliance.allianceId))
          .qs(query)
          .loginAs(admin!.user)
        response.assertStatus(422)
        assert.equal(response.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)
        assertNoSqlLeak(response.body(), assert)
      }
    } finally {
      await cleanupAttributions({ allianceIds: [alliance.allianceId], unitIds: [] })
    }
  })

  test('CA-6: la segunda página conserva el orden y agrega el avance una vez', async ({
    client,
    assert,
  }) => {
    const fixture = await seedOrderFixture()

    try {
      const { result: response, sqls } = await withSqlLog(async () => {
        return client
          .get(listUrl(fixture.alliance.allianceId))
          .qs({ limit: 2, page: 2 })
          .loginAs(admin!.user)
      })

      response.assertStatus(200)
      assert.deepEqual(
        response
          .body()
          .data.map((row: { allianceAttributionId: number }) => row.allianceAttributionId),
        [fixture.closedRecent.allianceAttributionId, fixture.closedOlder.allianceAttributionId]
      )
      assert.equal(response.body().meta.lastPage, 2)
      assert.equal(response.body().meta.total, 4)

      const accrualSqls = sqls.filter(
        (sql) => /alliance_commissions/i.test(sql) && /sum\(/i.test(sql)
      )
      assert.equal(accrualSqls.length, 1)
    } finally {
      await cleanupAttributions({
        allianceIds: [fixture.alliance.allianceId, fixture.otherAlliance.allianceId],
        unitIds: fixture.units.map((unit) => unit.businessUnitId),
      })
    }
  })

  test('CA-7: las atribuciones de otra alianza no aparecen ni suman', async ({
    client,
    assert,
  }) => {
    const fixture = await seedOrderFixture()

    try {
      const response = await client
        .get(listUrl(fixture.alliance.allianceId))
        .loginAs(admin!.user)
      response.assertStatus(200)
      const ids = response
        .body()
        .data.map((row: { allianceAttributionId: number }) => row.allianceAttributionId)
      assert.notInclude(ids, fixture.otherAttribution.allianceAttributionId)
      assert.equal(response.body().meta.total, 4)
    } finally {
      await cleanupAttributions({
        allianceIds: [fixture.alliance.allianceId, fixture.otherAlliance.allianceId],
        unitIds: fixture.units.map((unit) => unit.businessUnitId),
      })
    }
  })

  test('CA-8: la empresa con borrado lógico sigue en el listado', async ({ client, assert }) => {
    const fixture = await seedOrderFixture()

    try {
      await fixture.closedOlderUnit.delete()

      const response = await client
        .get(listUrl(fixture.alliance.allianceId))
        .loginAs(admin!.user)
      response.assertStatus(200)
      const row = response
        .body()
        .data.find(
          (item: { allianceAttributionId: number }) =>
            item.allianceAttributionId === fixture.closedOlder.allianceAttributionId
        )
      assert.isDefined(row)
      assert.equal(row.businessUnitName, fixture.closedOlderUnit.businessUnitName)
      assert.equal(row.businessUnitPublicId, fixture.closedOlderUnit.businessUnitPublicId)
    } finally {
      await cleanupAttributions({
        allianceIds: [fixture.alliance.allianceId, fixture.otherAlliance.allianceId],
        unitIds: fixture.units.map((unit) => unit.businessUnitId),
      })
    }
  })

  test('CA-9: una alianza desactivada se consulta igual', async ({ client, assert }) => {
    const fixture = await seedOrderFixture()

    try {
      fixture.alliance.allianceActive = 0
      await fixture.alliance.save()

      const response = await client
        .get(listUrl(fixture.alliance.allianceId))
        .loginAs(admin!.user)
      response.assertStatus(200)
      assert.deepEqual(
        response
          .body()
          .data.map((row: { allianceAttributionId: number }) => row.allianceAttributionId),
        [
          fixture.liveNewer.allianceAttributionId,
          fixture.liveOlder.allianceAttributionId,
          fixture.closedRecent.allianceAttributionId,
          fixture.closedOlder.allianceAttributionId,
        ]
      )
    } finally {
      await cleanupAttributions({
        allianceIds: [fixture.alliance.allianceId, fixture.otherAlliance.allianceId],
        unitIds: fixture.units.map((unit) => unit.businessUnitId),
      })
    }
  })
})

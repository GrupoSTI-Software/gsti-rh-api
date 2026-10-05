import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import Alliance from '#models/alliance'
import AllianceAttribution from '#models/alliance_attribution'
import AllianceCommission from '#models/alliance_commission'
import AlliancePayout from '#models/alliance_payout'
import AlliancePayoutCommission from '#models/alliance_payout_commission'
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
 * Comisiones devengadas por alianza (USRH1789529505468).
 * Listado, rango de fechas, totales del mismo alcance, paginación,
 * aislamiento y filtración de datos internos.
 */

const BASE = '/api/platform/alliances'

interface TestActor {
  user: User
  person: Person
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Commission',
    personLastname: 'Http',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: 'AllianceCommissionHttp123!',
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
    businessUnitSlug: `alliance-comm-${label}-${stamp}`,
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
  })
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Alliance commission plan ${stamp}`,
    billingPlanDescription: 'Fixture USRH1789529505468',
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

async function createBareSubscription(
  businessUnitId: number,
  billingPlanId: number
): Promise<BillingSubscription> {
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
    billingSubscriptionDiscountPercent: 0,
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
  baseCents: number
  percent: number
  amountCents: number
  paidOn: string
}): Promise<{ commission: AllianceCommission; payment: BillingPayment }> {
  const paidAt = DateTime.fromISO(`${params.paidOn}T12:00:00.000-06:00`)
  const payment = await BillingPayment.create({
    billingSubscriptionId: params.subscriptionId,
    billingPaymentAmountCents: params.baseCents + 128_000,
    billingPaymentPeriodAmountCents: params.baseCents + 128_000,
    billingPaymentPeriodsCovered: params.periods,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: params.baseCents,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: params.baseCents,
    billingPaymentTaxAmountCents: 128_000,
    billingPaymentTotalCents: params.baseCents + 128_000,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0.16,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: `ALLCOMM-${Date.now()}-${Math.random()}`,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: paidAt,
    billingPaymentPeriodStart: paidAt,
    billingPaymentPeriodEnd: paidAt.plus({ months: params.periods }),
  })

  const commission = await AllianceCommission.create({
    allianceId: params.allianceId,
    allianceAttributionId: params.attributionId,
    businessUnitId: params.businessUnitId,
    billingPaymentId: payment.billingPaymentId,
    allianceCommissionPeriods: params.periods,
    allianceCommissionBaseCents: params.baseCents,
    allianceCommissionPercent: params.percent,
    allianceCommissionAmountCents: params.amountCents,
    allianceCommissionPaidOn: DateTime.fromISO(params.paidOn, { zone: 'utc' }),
  })

  return { commission, payment }
}

async function cleanupFixture(params: {
  allianceIds: number[]
  unitIds: number[]
  planIds?: number[]
}) {
  if (params.allianceIds.length > 0) {
    const existingPayouts = await AlliancePayout.query()
      .whereIn('alliance_id', params.allianceIds)
      .select('alliance_payout_id')
    const payoutIds = existingPayouts.map((row) => row.alliancePayoutId)
    if (payoutIds.length > 0) {
      await AlliancePayoutCommission.query().whereIn('alliance_payout_id', payoutIds).delete()
      await AlliancePayout.query().whereIn('alliance_payout_id', payoutIds).delete()
    }
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
  for (const planId of params.planIds ?? []) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) {
      await plan.delete()
    }
  }
}

function url(allianceId: number | string): string {
  return `${BASE}/${allianceId}/commissions`
}

/**
 * Crea una liquidación directamente en BD (sin pasar por el endpoint de
 * liquidar): estas pruebas verifican lo que `GET …/commissions` deriva
 * de una liquidación registrada, no el registro en sí (cubierto en
 * `platform_alliance_payout.spec.ts`).
 */
async function createPayoutDirect(params: {
  allianceId: number
  commissionIds: number[]
  paidOn: string
  reference: string
  createdByUserId: number
}): Promise<AlliancePayout> {
  const payout = await AlliancePayout.create({
    allianceId: params.allianceId,
    alliancePayoutPaidOn: DateTime.fromISO(params.paidOn, { zone: 'utc' }),
    alliancePayoutReference: params.reference,
    alliancePayoutAmountCents: 0,
    alliancePayoutCreatedByUserId: params.createdByUserId,
  })
  for (const commissionId of params.commissionIds) {
    await AlliancePayoutCommission.create({
      alliancePayoutId: payout.alliancePayoutId,
      allianceCommissionId: commissionId,
    })
  }
  return payout
}

function assertNoInternalId(body: unknown, assert: { notInclude: (hay: string, n: string) => void }) {
  const raw = JSON.stringify(body)
  assert.notInclude(raw, '"businessUnitId"')
}

function assertNoSqlLeak(body: unknown, assert: { notInclude: (hay: string, n: string) => void }) {
  const raw = JSON.stringify(body)
  assert.notInclude(raw, 'sql')
  assert.notInclude(raw, 'ER_')
}

test.group('GET /api/platform/alliances/:allianceId/commissions', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('alliance-commission', true)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  test('CA-1: listado en orden más reciente primero, 13 campos y totales', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Alianza comisiones ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('delta')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      const { commission: x, payment: paymentX } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-13',
      })
      const { commission: y, payment: paymentY } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 2,
        baseCents: 1_600_000,
        percent: 10,
        amountCents: 160_000,
        paidOn: '2026-08-20',
      })

      const response = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      response.assertStatus(200)
      const body = response.body()
      assert.equal(body.type, 'success')
      assert.deepEqual(
        body.data.map((row: { allianceCommissionId: number }) => row.allianceCommissionId),
        [x.allianceCommissionId, y.allianceCommissionId]
      )

      const first = body.data[0]
      assert.equal(first.allianceId, alliance.allianceId)
      assert.equal(first.allianceAttributionId, attribution.allianceAttributionId)
      assert.equal(first.businessUnitPublicId, unit.businessUnitPublicId)
      assert.equal(first.businessUnitName, unit.businessUnitName)
      assert.equal(first.billingPaymentId, paymentX.billingPaymentId)
      assert.equal(first.billingSubscriptionId, subscription.billingSubscriptionId)
      assert.isString(first.billingPaymentPaidAt)
      assert.equal(first.allianceCommissionAccruedOn, '2026-09-13')
      assert.equal(first.allianceCommissionPeriods, 1)
      assert.equal(first.allianceCommissionBaseCents, 800_000)
      assert.equal(first.allianceCommissionPercent, 10)
      assert.equal(first.allianceCommissionAmountCents, 80_000)
      assert.equal(first.allianceCommissionStatus, 'pending')
      assert.isNull(first.livePayout)
      assert.isString(first.createdAt)
      assert.equal(Object.keys(first).length, 16)

      assert.deepEqual(body.meta.totals, {
        accruedCount: 2,
        accruedCents: 240_000,
        paidCount: 0,
        paidCents: 0,
        pendingCount: 2,
        pendingCents: 240_000,
      })
      void paymentY
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })

  test('CA-2: rango de fechas acota detalle y total; sin rango, todo', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 1
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Alianza rango ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('rango')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-13',
      })
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 2,
        baseCents: 1_600_000,
        percent: 10,
        amountCents: 160_000,
        paidOn: '2026-08-20',
      })

      const filtered = await client
        .get(url(alliance.allianceId))
        .qs({ from: '2026-09-01', to: '2026-09-30' })
        .loginAs(admin!.user)
      filtered.assertStatus(200)
      assert.equal(filtered.body().data.length, 1)
      assert.equal(filtered.body().meta.total, 1)
      assert.deepEqual(filtered.body().meta.totals, {
        accruedCount: 1,
        accruedCents: 80_000,
        paidCount: 0,
        paidCents: 0,
        pendingCount: 1,
        pendingCents: 80_000,
      })

      const full = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      full.assertStatus(200)
      assert.equal(full.body().data.length, 2)
      assert.deepEqual(full.body().meta.totals, {
        accruedCount: 2,
        accruedCents: 240_000,
        paidCount: 0,
        paidCents: 0,
        pendingCount: 2,
        pendingCents: 240_000,
      })
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })

  test('CA-3: extremos inclusivos', async ({ client, assert }) => {
    const stamp = Date.now() + 2
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Alianza extremos ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('extremos')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-13',
      })

      const response = await client
        .get(url(alliance.allianceId))
        .qs({ from: '2026-09-13', to: '2026-09-13' })
        .loginAs(admin!.user)
      response.assertStatus(200)
      assert.equal(response.body().data.length, 1)
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })

  test('CA-4: fecha inválida o from > to responde 422', async ({ client, assert }) => {
    const alliance = await createAllianceRow({
      name: `Alianza fecha inválida ${Date.now()}`,
      percent: 10,
      term: 12,
    })

    try {
      const impossible = await client
        .get(url(alliance.allianceId))
        .qs({ from: '2026-13-40' })
        .loginAs(admin!.user)
      impossible.assertStatus(422)
      assert.equal(impossible.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)

      const reversed = await client
        .get(url(alliance.allianceId))
        .qs({ from: '2026-09-20', to: '2026-09-01' })
        .loginAs(admin!.user)
      reversed.assertStatus(422)
      assert.equal(reversed.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)

      const noZeroPad = await client
        .get(url(alliance.allianceId))
        .qs({ from: '2026-9-1' })
        .loginAs(admin!.user)
      noZeroPad.assertStatus(422)
      assert.equal(noZeroPad.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [] })
    }
  })

  test('CA-5: alianza sin comisiones o recorte vacío responde 200 con ceros', async ({
    client,
    assert,
  }) => {
    const alliance = await createAllianceRow({
      name: `Alianza vacía ${Date.now()}`,
      percent: 10,
      term: 12,
    })

    try {
      const response = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      response.assertStatus(200)
      assert.deepEqual(response.body().data, [])
      assert.equal(response.body().meta.total, 0)
      assert.deepEqual(response.body().meta.totals, {
        accruedCount: 0,
        accruedCents: 0,
        paidCount: 0,
        paidCents: 0,
        pendingCount: 0,
        pendingCents: 0,
      })
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [] })
    }
  })

  test('CA-6: alianza inexistente, retirada o id no positivo responde 404', async ({
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
        const response = await client.get(url(allianceId)).loginAs(admin!.user)
        response.assertStatus(404)
        assert.equal(response.body().code, ALLIANCE_ERROR_CODES.NOT_FOUND)
        assertNoSqlLeak(response.body(), assert)
      }
    } finally {
      await Alliance.query().withTrashed().where('alliance_id', alliance.allianceId).delete()
    }
  })

  test('CA-7: query inválido responde 422', async ({ client, assert }) => {
    const alliance = await createAllianceRow({
      name: `Alianza query ${Date.now()}`,
      percent: 10,
      term: 12,
    })

    try {
      for (const query of [{ limit: 101 }, { limit: 0 }, { page: 0 }]) {
        const response = await client
          .get(url(alliance.allianceId))
          .qs(query)
          .loginAs(admin!.user)
        response.assertStatus(422)
        assert.equal(response.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)
      }
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [] })
    }
  })

  test('CA-8: la paginación no cambia el total, que suma las tres filas', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 3
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Alianza paginación ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('pagina')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      for (const [index, paidOn] of ['2026-09-01', '2026-09-05', '2026-09-10'].entries()) {
        await addCommission({
          allianceId: alliance.allianceId,
          attributionId: attribution.allianceAttributionId,
          businessUnitId: unit.businessUnitId,
          subscriptionId: subscription.billingSubscriptionId,
          periods: 1,
          baseCents: 800_000,
          percent: 10,
          amountCents: 80_000 + index,
          paidOn,
        })
      }

      const response = await client
        .get(url(alliance.allianceId))
        .qs({ limit: 2, page: 1 })
        .loginAs(admin!.user)
      response.assertStatus(200)
      assert.equal(response.body().data.length, 2)
      assert.equal(response.body().meta.total, 3)
      assert.equal(response.body().meta.totals.accruedCount, 3)
      assert.equal(response.body().meta.totals.accruedCents, 80_000 + 80_001 + 80_002)
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })

  test('CA-9: comisiones de otra alianza no aparecen ni suman', async ({ client, assert }) => {
    const stamp = Date.now() + 4
    const planIdA = await createPublishedPlan(stamp)
    const planIdB = await createPublishedPlan(stamp + 1)
    const allianceA = await createAllianceRow({
      name: `Alianza A ${stamp}`,
      percent: 10,
      term: 12,
    })
    const allianceB = await createAllianceRow({
      name: `Alianza B ${stamp}`,
      percent: 8,
      term: 12,
    })
    const unitA = await createClientUnit('a')
    const unitB = await createClientUnit('b')
    const attributionA = await createAttribution({
      allianceId: allianceA.allianceId,
      businessUnitId: unitA.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const attributionB = await createAttribution({
      allianceId: allianceB.allianceId,
      businessUnitId: unitB.businessUnitId,
      percent: 8,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscriptionA = await createBareSubscription(unitA.businessUnitId, planIdA)
    const subscriptionB = await createBareSubscription(unitB.businessUnitId, planIdB)

    try {
      await addCommission({
        allianceId: allianceA.allianceId,
        attributionId: attributionA.allianceAttributionId,
        businessUnitId: unitA.businessUnitId,
        subscriptionId: subscriptionA.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-01',
      })
      await addCommission({
        allianceId: allianceB.allianceId,
        attributionId: attributionB.allianceAttributionId,
        businessUnitId: unitB.businessUnitId,
        subscriptionId: subscriptionB.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 8,
        amountCents: 64_000,
        paidOn: '2026-09-01',
      })

      const response = await client.get(url(allianceA.allianceId)).loginAs(admin!.user)
      response.assertStatus(200)
      assert.equal(response.body().data.length, 1)
      assert.equal(response.body().meta.totals.accruedCents, 80_000)
    } finally {
      await cleanupFixture({
        allianceIds: [allianceA.allianceId, allianceB.allianceId],
        unitIds: [unitA.businessUnitId, unitB.businessUnitId],
        planIds: [planIdA, planIdB],
      })
    }
  })

  test('CA-10: comisión con fecha posterior al cierre se muestra normal', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 5
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Alianza cierre ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('cierre')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
      closedAt: '2026-08-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      const { commission } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-08-15',
      })

      const response = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      response.assertStatus(200)
      const row = response
        .body()
        .data.find(
          (item: { allianceCommissionId: number }) =>
            item.allianceCommissionId === commission.allianceCommissionId
        )
      assert.isDefined(row)
      assert.equal(row.allianceCommissionAccruedOn, '2026-08-15')
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })

  test('CA-11: no expone ids internos ni fuga sql en 404 o 422', async ({ client, assert }) => {
    const stamp = Date.now() + 6
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Alianza sin fuga ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('sinfuga')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-01',
      })

      const response = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      response.assertStatus(200)
      assertNoInternalId(response.body(), assert)
      assertNoSqlLeak(response.body(), assert)

      const notFound = await client.get(url('999999991')).loginAs(admin!.user)
      assertNoSqlLeak(notFound.body(), assert)

      const invalid = await client
        .get(url(alliance.allianceId))
        .qs({ limit: 0 })
        .loginAs(admin!.user)
      assertNoSqlLeak(invalid.body(), assert)
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })

  test('CA-12: livePayout siempre null, con o sin filtros', async ({ client, assert }) => {
    const stamp = Date.now() + 7
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Alianza payout ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('payout')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-01',
      })

      const withoutFilters = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      for (const row of withoutFilters.body().data) {
        assert.isNull(row.livePayout)
      }

      const withFilters = await client
        .get(url(alliance.allianceId))
        .qs({ from: '2026-09-01', to: '2026-09-30' })
        .loginAs(admin!.user)
      for (const row of withFilters.body().data) {
        assert.isNull(row.livePayout)
      }
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })
})

/**
 * Estado por pagar / pagada en el estado de cuenta (USRH1787719056820).
 * `allianceCommissionStatus`, `livePayout`, filtro `status` y los cuatro
 * totales nuevos, derivados de una liquidación registrada.
 */
test.group('GET /api/platform/alliances/:allianceId/commissions — estado de pago', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('alliance-commission-payout', true)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  test('CA-16: comisiones liquidadas salen "paid" con rastro; el resto "pending"', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 100
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({ name: `Alianza estado ${stamp}`, percent: 10, term: 12 })
    const unit = await createClientUnit('estado')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      const { commission: c1 } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-01',
      })
      const { commission: c2 } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-05',
      })
      const { commission: c3 } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-10',
      })
      const { commission: c4 } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-15',
      })
      const { commission: c5 } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-20',
      })

      await createPayoutDirect({
        allianceId: alliance.allianceId,
        commissionIds: [c1.allianceCommissionId, c2.allianceCommissionId, c3.allianceCommissionId],
        paidOn: '2026-09-30',
        reference: 'SPEI 0123456789',
        createdByUserId: admin!.user.userId,
      })

      const response = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      response.assertStatus(200)
      const byId = new Map(
        response.body().data.map((row: { allianceCommissionId: number }) => [row.allianceCommissionId, row])
      )

      for (const paid of [c1, c2, c3]) {
        const row = byId.get(paid.allianceCommissionId) as {
          allianceCommissionStatus: string
          livePayout: { alliancePayoutId: number; paidOn: string; reference: string; createdByName: string } | null
        }
        assert.equal(row.allianceCommissionStatus, 'paid')
        assert.isNotNull(row.livePayout)
        assert.equal(row.livePayout!.paidOn, '2026-09-30')
        assert.equal(row.livePayout!.reference, 'SPEI 0123456789')
        assert.equal(row.livePayout!.createdByName, `${admin!.person.personFirstname} ${admin!.person.personLastname}`)
      }
      for (const pending of [c4, c5]) {
        const row = byId.get(pending.allianceCommissionId) as {
          allianceCommissionStatus: string
          livePayout: unknown
        }
        assert.equal(row.allianceCommissionStatus, 'pending')
        assert.isNull(row.livePayout)
      }
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })

  test('CA-17: fila anulada por Query Builder vuelve a "pending", en detalle y en totales', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 101
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({ name: `Alianza anulada ${stamp}`, percent: 10, term: 12 })
    const unit = await createClientUnit('anulada')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      const { commission } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-01',
      })

      const payout = await createPayoutDirect({
        allianceId: alliance.allianceId,
        commissionIds: [commission.allianceCommissionId],
        paidOn: '2026-09-30',
        reference: 'SPEI anulada',
        createdByUserId: admin!.user.userId,
      })

      // La anulación por HTTP llega en USRH1787719056821; aquí se escribe
      // por Query Builder directo, tal como lo hará esa pieza.
      await AlliancePayoutCommission.query()
        .where('alliance_payout_id', payout.alliancePayoutId)
        .update({ alliancePayoutCommissionAnnulledAt: new Date() })

      const response = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      response.assertStatus(200)
      const row = response
        .body()
        .data.find((item: { allianceCommissionId: number }) => item.allianceCommissionId === commission.allianceCommissionId)
      assert.equal(row.allianceCommissionStatus, 'pending')
      assert.isNull(row.livePayout)
      assert.deepEqual(response.body().meta.totals, {
        accruedCount: 1,
        accruedCents: 80_000,
        paidCount: 0,
        paidCents: 0,
        pendingCount: 1,
        pendingCents: 80_000,
      })
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })

  test('CA-18: el filtro de estado acota solo el detalle; status inválido responde 422', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 102
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({ name: `Alianza filtro estado ${stamp}`, percent: 10, term: 12 })
    const unit = await createClientUnit('filtroestado')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      const { commission: paid } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-01',
      })
      const { commission: pending } = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: '2026-09-05',
      })
      await createPayoutDirect({
        allianceId: alliance.allianceId,
        commissionIds: [paid.allianceCommissionId],
        paidOn: '2026-09-30',
        reference: 'SPEI filtro',
        createdByUserId: admin!.user.userId,
      })

      const withoutStatus = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      const pendingOnly = await client.get(url(alliance.allianceId)).qs({ status: 'pending' }).loginAs(admin!.user)
      const paidOnly = await client.get(url(alliance.allianceId)).qs({ status: 'paid' }).loginAs(admin!.user)

      assert.equal(pendingOnly.body().data.length, 1)
      assert.equal(pendingOnly.body().data[0].allianceCommissionId, pending.allianceCommissionId)
      assert.equal(paidOnly.body().data.length, 1)
      assert.equal(paidOnly.body().data[0].allianceCommissionId, paid.allianceCommissionId)
      assert.equal(withoutStatus.body().data.length, 2)

      assert.deepEqual(withoutStatus.body().meta.totals, pendingOnly.body().meta.totals)
      assert.deepEqual(withoutStatus.body().meta.totals, paidOnly.body().meta.totals)

      const invalidStatus = await client.get(url(alliance.allianceId)).qs({ status: 'otro' }).loginAs(admin!.user)
      invalidStatus.assertStatus(422)
      assert.equal(invalidStatus.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })

  test('CA-19: devengado = pagado + por pagar, en monto y en conteo', async ({ client, assert }) => {
    const stamp = Date.now() + 103
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({ name: `Alianza totales pago ${stamp}`, percent: 10, term: 12 })
    const unit = await createClientUnit('totalespago')
    const attribution = await createAttribution({
      allianceId: alliance.allianceId,
      businessUnitId: unit.businessUnitId,
      percent: 10,
      term: 12,
      startsAt: '2026-01-01',
    })
    const subscription = await createBareSubscription(unit.businessUnitId, planId)

    try {
      const paidOnDates = ['2026-09-01', '2026-09-05', '2026-09-10', '2026-09-15', '2026-09-20']
      const commissions = []
      for (const paidOn of paidOnDates) {
        const { commission } = await addCommission({
          allianceId: alliance.allianceId,
          attributionId: attribution.allianceAttributionId,
          businessUnitId: unit.businessUnitId,
          subscriptionId: subscription.billingSubscriptionId,
          periods: 1,
          baseCents: 800_000,
          percent: 10,
          amountCents: 80_000,
          paidOn,
        })
        commissions.push(commission)
      }

      await createPayoutDirect({
        allianceId: alliance.allianceId,
        commissionIds: commissions.slice(0, 3).map((c) => c.allianceCommissionId),
        paidOn: '2026-09-30',
        reference: 'SPEI totales',
        createdByUserId: admin!.user.userId,
      })

      const response = await client.get(url(alliance.allianceId)).loginAs(admin!.user)
      response.assertStatus(200)
      assert.deepEqual(response.body().meta.totals, {
        accruedCount: 5,
        accruedCents: 400_000,
        paidCount: 3,
        paidCents: 240_000,
        pendingCount: 2,
        pendingCents: 160_000,
      })

      const excludingPaid = await client
        .get(url(alliance.allianceId))
        .qs({ from: '2026-09-14', to: '2026-09-30' })
        .loginAs(admin!.user)
      const totals = excludingPaid.body().meta.totals
      assert.equal(totals.paidCount, 0)
      assert.equal(totals.paidCents, 0)
      assert.equal(totals.accruedCount, totals.paidCount + totals.pendingCount)
      assert.equal(totals.accruedCents, totals.paidCents + totals.pendingCents)
    } finally {
      await cleanupFixture({
        allianceIds: [alliance.allianceId],
        unitIds: [unit.businessUnitId],
        planIds: [planId],
      })
    }
  })
})

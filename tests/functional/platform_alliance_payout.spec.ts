import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
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
import { todayInBusinessZone, toBusinessDateString } from '#utils/business_date'

/**
 * Liquidaciones de comisiones de alianza (USRH1787719056820).
 * Alta, todo o nada, fechas, aislamiento entre alianzas, orden de
 * evaluación, garantía de base de datos e inmutabilidad.
 */

const BASE = '/api/platform/alliances'

function payoutsUrl(allianceId: number | string): string {
  return `${BASE}/${allianceId}/payouts`
}

/** Fecha de negocio (`YYYY-MM-DD`) desplazada `days` días (negativo = pasado). */
function businessDateOffset(days: number): string {
  return toBusinessDateString(todayInBusinessZone().plus({ days }))
}

interface TestActor {
  user: User
  person: Person
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Payout',
    personLastname: 'Http',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: 'AlliancePayoutHttp123!',
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
    businessUnitName: `Cliente payout ${label} ${stamp}`,
    businessUnitSlug: `alliance-payout-${label}-${stamp}`,
    businessUnitLegalName: `Cliente payout ${label} Legal ${stamp}`,
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
}): Promise<AllianceAttribution> {
  return AllianceAttribution.create({
    allianceId: params.allianceId,
    businessUnitId: params.businessUnitId,
    allianceAttributionCommissionPercent: params.percent,
    allianceAttributionTermPeriods: params.term,
    allianceAttributionStartsAt: DateTime.fromISO(params.startsAt, { zone: 'utc' }),
  })
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Alliance payout plan ${stamp}`,
    billingPlanDescription: 'Fixture USRH1787719056820',
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
}): Promise<AllianceCommission> {
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
    billingPaymentReference: `ALLPAYOUT-${Date.now()}-${Math.random()}`,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: paidAt,
    billingPaymentPeriodStart: paidAt,
    billingPaymentPeriodEnd: paidAt.plus({ months: params.periods }),
  })

  return AllianceCommission.create({
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
}

/** Levanta alianza + cliente + atribución + suscripción listos para `addCommission`. */
async function createFixtureAlliance(
  label: string,
  overrides: { active?: 0 | 1 } = {}
): Promise<{ alliance: Alliance; unit: BusinessUnit; attribution: AllianceAttribution; planId: number }> {
  const stamp = Date.now() + Math.floor(Math.random() * 1_000_000)
  const planId = await createPublishedPlan(stamp)
  const alliance = await createAllianceRow({
    name: `Alianza payout ${label} ${stamp}`,
    percent: 10,
    term: 12,
    active: overrides.active,
  })
  const unit = await createClientUnit(label)
  const attribution = await createAttribution({
    allianceId: alliance.allianceId,
    businessUnitId: unit.businessUnitId,
    percent: 10,
    term: 12,
    startsAt: businessDateOffset(-365),
  })
  await createBareSubscription(unit.businessUnitId, planId)
  return { alliance, unit, attribution, planId }
}

async function cleanupFixture(params: { allianceIds: number[]; unitIds: number[]; planIds?: number[] }) {
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
      await BillingPayment.query().where('billing_subscription_id', subscription.billingSubscriptionId).delete()
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
    if (plan) await plan.delete()
  }
}

function assertNoSqlLeak(body: unknown, assert: { notInclude: (hay: string, n: string) => void }) {
  const raw = JSON.stringify(body)
  assert.notInclude(raw, 'sql')
  assert.notInclude(raw, 'ER_')
  assert.notInclude(raw, 'alliance_payout_commissions')
}

test.group('POST /api/platform/alliances/:allianceId/payouts', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('alliance-payout', true)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  test('CA-1: registra la liquidación, congela el monto y no toca las comisiones', async ({
    client,
    assert,
  }) => {
    const { alliance, unit, attribution, planId } = await createFixtureAlliance('ca1')
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', unit.businessUnitId)
      .firstOrFail()

    try {
      const c1 = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-46),
      })
      const c2 = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-27),
      })
      const c3 = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 3,
        baseCents: 2_400_000,
        percent: 10,
        amountCents: 240_000,
        paidOn: businessDateOffset(-10),
      })

      const before = await db
        .from('alliance_commissions')
        .whereIn('alliance_commission_id', [c1.allianceCommissionId, c2.allianceCommissionId, c3.allianceCommissionId])
        .orderBy('alliance_commission_id')

      const response = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({
          commissionIds: [c3.allianceCommissionId, c1.allianceCommissionId, c2.allianceCommissionId],
          paidOn: businessDateOffset(0),
          reference: 'SPEI 0123456789',
        })
        .loginAs(admin!.user)

      response.assertStatus(201)
      const body = response.body()
      assert.equal(body.type, 'success')
      const data = body.data
      assert.equal(data.alliancePayoutAmountCents, 400_000)
      assert.equal(data.alliancePayoutCommissionsCount, 3)
      assert.deepEqual(
        data.allianceCommissionIds,
        [c1.allianceCommissionId, c2.allianceCommissionId, c3.allianceCommissionId].sort((a, b) => a - b)
      )
      assert.equal(data.alliancePayoutCreatedByUserId, admin!.user.userId)
      assert.equal(
        data.alliancePayoutCreatedByName,
        `${admin!.person.personFirstname} ${admin!.person.personLastname}`
      )
      assert.equal(data.allianceId, alliance.allianceId)
      assert.equal(data.alliancePayoutPaidOn, businessDateOffset(0))
      assert.equal(data.alliancePayoutReference, 'SPEI 0123456789')

      const payoutRow = await AlliancePayout.query().where('alliance_id', alliance.allianceId).firstOrFail()
      assert.isNull(payoutRow.alliancePayoutAnnulledAt)
      assert.isNull(payoutRow.alliancePayoutAnnulmentReason)
      assert.isNull(payoutRow.alliancePayoutAnnulledByUserId)

      const pivotRows = await AlliancePayoutCommission.query().where(
        'alliance_payout_id',
        payoutRow.alliancePayoutId
      )
      assert.equal(pivotRows.length, 3)
      for (const row of pivotRows) {
        assert.isNull(row.alliancePayoutCommissionAnnulledAt)
      }

      const after = await db
        .from('alliance_commissions')
        .whereIn('alliance_commission_id', [c1.allianceCommissionId, c2.allianceCommissionId, c3.allianceCommissionId])
        .orderBy('alliance_commission_id')
      assert.deepEqual(JSON.parse(JSON.stringify(before)), JSON.parse(JSON.stringify(after)))
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [unit.businessUnitId], planIds: [planId] })
    }
  })

  test('CA-2: el actor de la liquidación sale del token, nunca del cuerpo', async ({ client, assert }) => {
    const { alliance, unit, attribution, planId } = await createFixtureAlliance('ca2')
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', unit.businessUnitId)
      .firstOrFail()

    try {
      const c1 = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-5),
      })

      const response = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({
          commissionIds: [c1.allianceCommissionId],
          paidOn: businessDateOffset(0),
          reference: 'SPEI actor',
          alliancePayoutCreatedByUserId: 999_999,
        })
        .loginAs(admin!.user)

      response.assertStatus(201)
      assert.equal(response.body().data.alliancePayoutCreatedByUserId, admin!.user.userId)

      const payoutRow = await AlliancePayout.query().where('alliance_id', alliance.allianceId).firstOrFail()
      assert.equal(payoutRow.alliancePayoutCreatedByUserId, admin!.user.userId)
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [unit.businessUnitId], planIds: [planId] })
    }
  })

  test('CA-3: comisión ya pagada rechaza el conjunto completo, sin delta', async ({ client, assert }) => {
    const { alliance, unit, attribution, planId } = await createFixtureAlliance('ca3')
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', unit.businessUnitId)
      .firstOrFail()

    try {
      const c1 = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-20),
      })
      const c4 = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-5),
      })

      const first = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({ commissionIds: [c1.allianceCommissionId], paidOn: businessDateOffset(0), reference: 'REF-1' })
        .loginAs(admin!.user)
      first.assertStatus(201)

      const payoutsBefore = await AlliancePayout.query().where('alliance_id', alliance.allianceId).count('* as total')
      const existingPayoutsBefore = await AlliancePayout.query().where('alliance_id', alliance.allianceId)
      const pivotBefore = await AlliancePayoutCommission.query()
        .whereIn('alliance_payout_id', existingPayoutsBefore.map((p) => p.alliancePayoutId))
        .count('* as total')

      const second = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({
          commissionIds: [c4.allianceCommissionId, c1.allianceCommissionId],
          paidOn: businessDateOffset(0),
          reference: 'REF-2',
        })
        .loginAs(admin!.user)
      second.assertStatus(409)
      assert.equal(second.body().code, ALLIANCE_ERROR_CODES.COMMISSION_ALREADY_PAID)
      assert.equal(second.body().key, 'comision-ya-pagada')

      const payoutsAfter = await AlliancePayout.query().where('alliance_id', alliance.allianceId).count('* as total')
      const existingPayoutsAfter = await AlliancePayout.query().where('alliance_id', alliance.allianceId)
      const pivotAfter = await AlliancePayoutCommission.query()
        .whereIn('alliance_payout_id', existingPayoutsAfter.map((p) => p.alliancePayoutId))
        .count('* as total')
      assert.equal(Number(payoutsAfter[0].$extras.total), Number(payoutsBefore[0].$extras.total))
      assert.equal(Number(pivotAfter[0].$extras.total), Number(pivotBefore[0].$extras.total))

      const c4Pivot = await AlliancePayoutCommission.query().where(
        'alliance_commission_id',
        c4.allianceCommissionId
      )
      assert.lengthOf(c4Pivot, 0)
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [unit.businessUnitId], planIds: [planId] })
    }
  })

  test('CA-4: comisión ajena e inexistente responden 404 idéntico, sin ids', async ({ client, assert }) => {
    const fixtureA = await createFixtureAlliance('ca4a')
    const fixtureB = await createFixtureAlliance('ca4b')
    const subscriptionB = await BillingSubscription.query()
      .where('business_unit_id', fixtureB.unit.businessUnitId)
      .firstOrFail()

    try {
      const commissionB = await addCommission({
        allianceId: fixtureB.alliance.allianceId,
        attributionId: fixtureB.attribution.allianceAttributionId,
        businessUnitId: fixtureB.unit.businessUnitId,
        subscriptionId: subscriptionB.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-5),
      })

      const foreignResponse = await client
        .post(payoutsUrl(fixtureA.alliance.allianceId))
        .json({
          commissionIds: [commissionB.allianceCommissionId],
          paidOn: businessDateOffset(0),
          reference: 'REF-ajena',
        })
        .loginAs(admin!.user)
      foreignResponse.assertStatus(404)
      assert.equal(foreignResponse.body().code, ALLIANCE_ERROR_CODES.COMMISSION_NOT_FOUND)
      assertNoSqlLeak(foreignResponse.body(), assert)

      const missingResponse = await client
        .post(payoutsUrl(fixtureA.alliance.allianceId))
        .json({ commissionIds: [999_999_991], paidOn: businessDateOffset(0), reference: 'REF-inexistente' })
        .loginAs(admin!.user)
      missingResponse.assertStatus(404)
      assert.equal(missingResponse.body().code, ALLIANCE_ERROR_CODES.COMMISSION_NOT_FOUND)
      assertNoSqlLeak(missingResponse.body(), assert)

      assert.deepEqual(foreignResponse.body(), missingResponse.body())
    } finally {
      await cleanupFixture({
        allianceIds: [fixtureA.alliance.allianceId, fixtureB.alliance.allianceId],
        unitIds: [fixtureA.unit.businessUnitId, fixtureB.unit.businessUnitId],
        planIds: [fixtureA.planId, fixtureB.planId],
      })
    }
  })

  test('CA-5: forma del cuerpo responde 422, nunca 500', async ({ client, assert }) => {
    const { alliance, unit, attribution, planId } = await createFixtureAlliance('ca5')
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', unit.businessUnitId)
      .firstOrFail()

    try {
      const validCommission = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-1),
      })

      const badBodies: Array<Record<string, unknown>> = [
        { commissionIds: [], paidOn: businessDateOffset(0), reference: 'REF' },
        {
          commissionIds: Array.from({ length: 201 }, (_, i) => i + 1),
          paidOn: businessDateOffset(0),
          reference: 'REF',
        },
        { commissionIds: [1, 1], paidOn: businessDateOffset(0), reference: 'REF' },
        { commissionIds: [1], paidOn: businessDateOffset(0), reference: '   ' },
        { commissionIds: [1], paidOn: businessDateOffset(0), reference: 'a'.repeat(161) },
        { commissionIds: [1], paidOn: businessDateOffset(0), reference: 'SPEI\n0123' },
        { commissionIds: [1], paidOn: '30/09/2026', reference: 'REF' },
        { commissionIds: [1], paidOn: '2026-02-30', reference: 'REF' },
      ]

      for (const body of badBodies) {
        const response = await client.post(payoutsUrl(alliance.allianceId)).json(body).loginAs(admin!.user)
        response.assertStatus(422)
        assert.equal(response.body().code, ALLIANCE_ERROR_CODES.VAL_INPUT)
        assertNoSqlLeak(response.body(), assert)
      }

      const accented = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({
          commissionIds: [validCommission.allianceCommissionId],
          paidOn: businessDateOffset(0),
          reference: 'Depósito Peña ñoño',
        })
        .loginAs(admin!.user)
      accented.assertStatus(201)
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [unit.businessUnitId], planIds: [planId] })
    }
  })

  test('CA-6: paidOn futuro o anterior a la comisión más reciente responde 422', async ({
    client,
    assert,
  }) => {
    const { alliance, unit, attribution, planId } = await createFixtureAlliance('ca6')
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', unit.businessUnitId)
      .firstOrFail()

    try {
      const cFuture = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-2),
      })

      const future = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({
          commissionIds: [cFuture.allianceCommissionId],
          paidOn: businessDateOffset(1),
          reference: 'REF-futuro',
        })
        .loginAs(admin!.user)
      future.assertStatus(422)
      assert.equal(future.body().code, ALLIANCE_ERROR_CODES.PAYOUT_DATE_IN_FUTURE)

      const today = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({
          commissionIds: [cFuture.allianceCommissionId],
          paidOn: businessDateOffset(0),
          reference: 'REF-hoy',
        })
        .loginAs(admin!.user)
      today.assertStatus(201)

      const cRecent = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-1),
      })

      const before = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({
          commissionIds: [cRecent.allianceCommissionId],
          paidOn: businessDateOffset(-2),
          reference: 'REF-anterior',
        })
        .loginAs(admin!.user)
      before.assertStatus(422)
      assert.equal(before.body().code, ALLIANCE_ERROR_CODES.PAYOUT_DATE_BEFORE_ACCRUAL)

      const equal = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({
          commissionIds: [cRecent.allianceCommissionId],
          paidOn: businessDateOffset(-1),
          reference: 'REF-igual',
        })
        .loginAs(admin!.user)
      equal.assertStatus(201)
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [unit.businessUnitId], planIds: [planId] })
    }
  })

  test('CA-7: alianza desactivada se liquida; inexistente, retirada o no numérica se informa', async ({
    client,
    assert,
  }) => {
    const { alliance, unit, attribution, planId } = await createFixtureAlliance('ca7', { active: 0 })
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', unit.businessUnitId)
      .firstOrFail()

    const retired = await createAllianceRow({ name: `Alianza retirada ${Date.now()}`, percent: 10, term: 12 })
    await retired.delete()

    try {
      const commission = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-3),
      })

      const inactiveResponse = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({ commissionIds: [commission.allianceCommissionId], paidOn: businessDateOffset(0), reference: 'REF' })
        .loginAs(admin!.user)
      inactiveResponse.assertStatus(201)

      for (const allianceId of ['abc', '999999991', String(retired.allianceId)]) {
        const response = await client
          .post(payoutsUrl(allianceId))
          .json({ commissionIds: [1], paidOn: businessDateOffset(0), reference: 'REF' })
          .loginAs(admin!.user)
        response.assertStatus(404)
        assert.equal(response.body().code, ALLIANCE_ERROR_CODES.NOT_FOUND)
      }
    } finally {
      await Alliance.query().withTrashed().where('alliance_id', retired.allianceId).delete()
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [unit.businessUnitId], planIds: [planId] })
    }
  })

  test('CA-8: orden de evaluación — fecha futura antes que alianza; 404 antes que 409', async ({
    client,
    assert,
  }) => {
    const fixtureA = await createFixtureAlliance('ca8a')
    const fixtureB = await createFixtureAlliance('ca8b')
    const subscriptionA = await BillingSubscription.query()
      .where('business_unit_id', fixtureA.unit.businessUnitId)
      .firstOrFail()
    const subscriptionB = await BillingSubscription.query()
      .where('business_unit_id', fixtureB.unit.businessUnitId)
      .firstOrFail()

    try {
      const futureResponse = await client
        .post(payoutsUrl(999_999_991))
        .json({ commissionIds: [1], paidOn: businessDateOffset(1), reference: 'REF' })
        .loginAs(admin!.user)
      futureResponse.assertStatus(422)
      assert.equal(futureResponse.body().code, ALLIANCE_ERROR_CODES.PAYOUT_DATE_IN_FUTURE)

      const cPaid = await addCommission({
        allianceId: fixtureA.alliance.allianceId,
        attributionId: fixtureA.attribution.allianceAttributionId,
        businessUnitId: fixtureA.unit.businessUnitId,
        subscriptionId: subscriptionA.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-5),
      })
      const firstPayout = await client
        .post(payoutsUrl(fixtureA.alliance.allianceId))
        .json({ commissionIds: [cPaid.allianceCommissionId], paidOn: businessDateOffset(0), reference: 'REF-1' })
        .loginAs(admin!.user)
      firstPayout.assertStatus(201)

      const cForeign = await addCommission({
        allianceId: fixtureB.alliance.allianceId,
        attributionId: fixtureB.attribution.allianceAttributionId,
        businessUnitId: fixtureB.unit.businessUnitId,
        subscriptionId: subscriptionB.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-5),
      })

      const mixedResponse = await client
        .post(payoutsUrl(fixtureA.alliance.allianceId))
        .json({
          commissionIds: [cPaid.allianceCommissionId, cForeign.allianceCommissionId],
          paidOn: businessDateOffset(0),
          reference: 'REF-mixto',
        })
        .loginAs(admin!.user)
      mixedResponse.assertStatus(404)
      assert.equal(mixedResponse.body().code, ALLIANCE_ERROR_CODES.COMMISSION_NOT_FOUND)
    } finally {
      await cleanupFixture({
        allianceIds: [fixtureA.alliance.allianceId, fixtureB.alliance.allianceId],
        unitIds: [fixtureA.unit.businessUnitId, fixtureB.unit.businessUnitId],
        planIds: [fixtureA.planId, fixtureB.planId],
      })
    }
  })

  test('CA-9: el UNIQUE del pivote es la garantía real, no solo la validación previa', async ({
    assert,
  }) => {
    const { alliance, unit, attribution, planId } = await createFixtureAlliance('ca9')
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', unit.businessUnitId)
      .firstOrFail()

    try {
      const commission = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-1),
      })

      const payout = await AlliancePayout.create({
        allianceId: alliance.allianceId,
        alliancePayoutPaidOn: DateTime.fromISO(businessDateOffset(0), { zone: 'utc' }),
        alliancePayoutReference: 'REF-directo',
        alliancePayoutAmountCents: 80_000,
        alliancePayoutCreatedByUserId: admin!.user.userId,
      })

      const firstInsert = await db.table('alliance_payout_commissions').insert({
        alliance_payout_id: payout.alliancePayoutId,
        alliance_commission_id: commission.allianceCommissionId,
      })
      const firstRowId = Number(firstInsert[0])

      let duplicateError: { code?: string; sqlMessage?: string } | null = null
      try {
        await db.table('alliance_payout_commissions').insert({
          alliance_payout_id: payout.alliancePayoutId,
          alliance_commission_id: commission.allianceCommissionId,
        })
      } catch (error) {
        duplicateError = error as { code?: string; sqlMessage?: string }
      }
      assert.isNotNull(duplicateError)
      assert.equal(duplicateError?.code, 'ER_DUP_ENTRY')
      assert.include(duplicateError?.sqlMessage ?? '', 'alliance_payout_commissions_commission_live_unique')

      await db
        .from('alliance_payout_commissions')
        .where('alliance_payout_commission_id', firstRowId)
        .update({ alliance_payout_commission_annulled_at: DateTime.now().toSQL({ includeOffset: false }) })

      const secondInsert = await db.table('alliance_payout_commissions').insert({
        alliance_payout_id: payout.alliancePayoutId,
        alliance_commission_id: commission.allianceCommissionId,
      })
      assert.isTrue(Number(secondInsert[0]) > 0)
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [unit.businessUnitId], planIds: [planId] })
    }
  })

  test('CA-10: inmutabilidad desde el modelo y el servicio', async ({ assert }) => {
    const { alliance, unit, attribution, planId } = await createFixtureAlliance('ca10')
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', unit.businessUnitId)
      .firstOrFail()

    try {
      const commission = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-1),
      })

      const payout = await AlliancePayout.create({
        allianceId: alliance.allianceId,
        alliancePayoutPaidOn: DateTime.fromISO(businessDateOffset(0), { zone: 'utc' }),
        alliancePayoutReference: 'REF-inmutable',
        alliancePayoutAmountCents: 80_000,
        alliancePayoutCreatedByUserId: admin!.user.userId,
      })

      await assert.rejects(() => payout.merge({ alliancePayoutReference: 'otra' }).save())
      await assert.rejects(() => payout.delete())

      const pivotRow = await AlliancePayoutCommission.create({
        alliancePayoutId: payout.alliancePayoutId,
        allianceCommissionId: commission.allianceCommissionId,
      })
      await assert.rejects(() => pivotRow.delete())

      const { readFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const serviceSource = await readFile(
        join(process.cwd(), 'app/services/alliance_payout_service.ts'),
        'utf8'
      )
      assert.notMatch(serviceSource, /AllianceCommission\.(create|updateOrCreate)\(/)
      assert.notMatch(serviceSource, /commission\.(merge|save|delete)\(/)
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [unit.businessUnitId], planIds: [planId] })
    }
  })

  test('CA-11: ningún cuerpo de error filtra SQL ni nombres de tabla internos', async ({
    client,
    assert,
  }) => {
    const { alliance, unit, attribution, planId } = await createFixtureAlliance('ca11')
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', unit.businessUnitId)
      .firstOrFail()

    try {
      const commission = await addCommission({
        allianceId: alliance.allianceId,
        attributionId: attribution.allianceAttributionId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        baseCents: 800_000,
        percent: 10,
        amountCents: 80_000,
        paidOn: businessDateOffset(-1),
      })

      const already = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({ commissionIds: [commission.allianceCommissionId], paidOn: businessDateOffset(0), reference: 'REF' })
        .loginAs(admin!.user)
      already.assertStatus(201)

      const duplicate = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({ commissionIds: [commission.allianceCommissionId], paidOn: businessDateOffset(0), reference: 'REF-2' })
        .loginAs(admin!.user)
      duplicate.assertStatus(409)
      assertNoSqlLeak(duplicate.body(), assert)

      const notFound = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({ commissionIds: [999_999_991], paidOn: businessDateOffset(0), reference: 'REF-3' })
        .loginAs(admin!.user)
      assertNoSqlLeak(notFound.body(), assert)

      const badInput = await client
        .post(payoutsUrl(alliance.allianceId))
        .json({ commissionIds: [], paidOn: businessDateOffset(0), reference: 'REF-4' })
        .loginAs(admin!.user)
      assertNoSqlLeak(badInput.body(), assert)
    } finally {
      await cleanupFixture({ allianceIds: [alliance.allianceId], unitIds: [unit.businessUnitId], planIds: [planId] })
    }
  })
})

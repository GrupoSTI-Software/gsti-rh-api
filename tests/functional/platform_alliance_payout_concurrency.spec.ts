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
import { todayInBusinessZone, toBusinessDateString } from '#utils/business_date'

/**
 * Carrera sobre la garantía de "una comisión nunca en dos liquidaciones
 * vivas" (USRH1787719056820, regla 8). El candado real es el UNIQUE de
 * la base de datos; estas pruebas lo ejercitan con `Promise.all`, no
 * con mocks.
 */

const BASE = '/api/platform/alliances'

function payoutsUrl(allianceId: number): string {
  return `${BASE}/${allianceId}/payouts`
}

function businessDateOffset(days: number): string {
  return toBusinessDateString(todayInBusinessZone().plus({ days }))
}

interface TestActor {
  user: User
  person: Person
}

async function createActor(emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Payout',
    personLastname: 'Race',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: 'AlliancePayoutRace123!',
    userActive: 1,
    isPlatformAdmin: true,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user, person }
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Alliance payout race plan ${stamp}`,
    billingPlanDescription: 'Fixture USRH1787719056820 concurrencia',
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

async function createFixture(label: string) {
  const stamp = Date.now() + Math.floor(Math.random() * 1_000_000)
  const planId = await createPublishedPlan(stamp)
  const alliance = await Alliance.create({
    allianceName: `Alianza carrera ${label} ${stamp}`,
    allianceContactName: null,
    allianceContactEmail: null,
    allianceContactPhone: null,
    allianceDefaultCommissionPercent: 10,
    allianceDefaultTermPeriods: 12,
    allianceActive: 1,
  })
  const unit = await BusinessUnit.create({
    businessUnitName: `Cliente carrera ${label} ${stamp}`,
    businessUnitSlug: `alliance-payout-race-${label}-${stamp}`,
    businessUnitLegalName: `Cliente carrera ${label} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const attribution = await AllianceAttribution.create({
    allianceId: alliance.allianceId,
    businessUnitId: unit.businessUnitId,
    allianceAttributionCommissionPercent: 10,
    allianceAttributionTermPeriods: 12,
    allianceAttributionStartsAt: DateTime.fromISO(businessDateOffset(-365), { zone: 'utc' }),
  })
  const price = await BillingPlanPrice.query().where('billing_plan_id', planId).firstOrFail()
  const now = DateTime.now()
  const subscription = await BillingSubscription.create({
    businessUnitId: unit.businessUnitId,
    billingPlanId: planId,
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
    billingSubscriptionLiveBusinessUnitId: unit.businessUnitId,
  })
  return { alliance, unit, attribution, subscription, planId }
}

async function addCommission(params: {
  allianceId: number
  attributionId: number
  businessUnitId: number
  subscriptionId: number
  amountCents: number
  paidOn: string
}): Promise<AllianceCommission> {
  const paidAt = DateTime.fromISO(`${params.paidOn}T12:00:00.000-06:00`)
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
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0.16,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: `ALLPAYOUTRACE-${Date.now()}-${Math.random()}`,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: paidAt,
    billingPaymentPeriodStart: paidAt,
    billingPaymentPeriodEnd: paidAt.plus({ months: 1 }),
  })
  return AllianceCommission.create({
    allianceId: params.allianceId,
    allianceAttributionId: params.attributionId,
    businessUnitId: params.businessUnitId,
    billingPaymentId: payment.billingPaymentId,
    allianceCommissionPeriods: 1,
    allianceCommissionBaseCents: 800_000,
    allianceCommissionPercent: 10,
    allianceCommissionAmountCents: params.amountCents,
    allianceCommissionPaidOn: DateTime.fromISO(params.paidOn, { zone: 'utc' }),
  })
}

async function cleanupFixture(params: { allianceId: number; unitId: number; planId: number }) {
  const existingPayouts = await AlliancePayout.query()
    .where('alliance_id', params.allianceId)
    .select('alliance_payout_id')
  const payoutIds = existingPayouts.map((row) => row.alliancePayoutId)
  if (payoutIds.length > 0) {
    await AlliancePayoutCommission.query().whereIn('alliance_payout_id', payoutIds).delete()
    await AlliancePayout.query().whereIn('alliance_payout_id', payoutIds).delete()
  }
  await AllianceCommission.query().where('alliance_id', params.allianceId).delete()
  const subscriptions = await BillingSubscription.query().withTrashed().where('business_unit_id', params.unitId)
  for (const subscription of subscriptions) {
    await BillingPayment.query().where('billing_subscription_id', subscription.billingSubscriptionId).delete()
    await subscription.forceDelete()
  }
  await AllianceAttribution.query().where('business_unit_id', params.unitId).delete()
  await BusinessUnit.query().withTrashed().where('business_unit_id', params.unitId).delete()
  await Alliance.query().where('alliance_id', params.allianceId).delete()
  await BillingVolumeTier.query().where('billing_plan_id', params.planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', params.planId).delete()
  const plan = await BillingPlan.find(params.planId)
  if (plan) await plan.delete()
}

test.group('POST /api/platform/alliances/:allianceId/payouts — concurrencia', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('alliance-payout-race')
  })

  group.teardown(async () => {
    if (!admin) return
    await User.query().where('user_id', admin.user.userId).delete()
    await Person.query().where('person_id', admin.person.personId).delete()
  })

  test('CA-12: 10 rondas, mismo conjunto simultáneo — siempre [201, 409], nunca 500', async ({
    client,
    assert,
  }) => {
    for (let round = 0; round < 10; round += 1) {
      const fixture = await createFixture(`ca12-${round}`)
      try {
        const commissionIds = await Promise.all(
          [0, 1, 2].map((i) =>
            addCommission({
              allianceId: fixture.alliance.allianceId,
              attributionId: fixture.attribution.allianceAttributionId,
              businessUnitId: fixture.unit.businessUnitId,
              subscriptionId: fixture.subscription.billingSubscriptionId,
              amountCents: 80_000,
              paidOn: businessDateOffset(-1 - i),
            })
          )
        ).then((rows) => rows.map((row) => row.allianceCommissionId))

        const body = {
          commissionIds,
          paidOn: businessDateOffset(0),
          reference: `REF-race-${round}`,
        }

        const [a, b] = await Promise.all([
          client.post(payoutsUrl(fixture.alliance.allianceId)).json(body).loginAs(admin!.user),
          client.post(payoutsUrl(fixture.alliance.allianceId)).json(body).loginAs(admin!.user),
        ])

        const statuses = [a.status(), b.status()].sort((x, y) => x - y)
        assert.deepEqual(statuses, [201, 409])

        const loser = a.status() === 409 ? a : b
        assert.equal(loser.body().code, ALLIANCE_ERROR_CODES.COMMISSION_ALREADY_PAID)

        const payouts = await AlliancePayout.query().where('alliance_id', fixture.alliance.allianceId)
        assert.lengthOf(payouts, 1)
        const liveRows = await AlliancePayoutCommission.query()
          .where('alliance_payout_id', payouts[0].alliancePayoutId)
          .whereNull('alliance_payout_commission_annulled_at')
        assert.lengthOf(liveRows, 3)
      } finally {
        await cleanupFixture({
          allianceId: fixture.alliance.allianceId,
          unitId: fixture.unit.businessUnitId,
          planId: fixture.planId,
        })
      }
    }
  }).timeout(60_000)

  test('CA-13: 10 rondas, conjuntos solapados en distinto orden — exactamente un 201 y un 409', async ({
    client,
    assert,
  }) => {
    for (let round = 0; round < 10; round += 1) {
      const fixture = await createFixture(`ca13-${round}`)
      try {
        const rows = await Promise.all(
          [0, 1, 2, 3].map((i) =>
            addCommission({
              allianceId: fixture.alliance.allianceId,
              attributionId: fixture.attribution.allianceAttributionId,
              businessUnitId: fixture.unit.businessUnitId,
              subscriptionId: fixture.subscription.billingSubscriptionId,
              amountCents: 80_000,
              paidOn: businessDateOffset(-1 - i),
            })
          )
        )
        const [c1, c2, c3, c4] = rows.map((row) => row.allianceCommissionId)

        const [a, b] = await Promise.all([
          client
            .post(payoutsUrl(fixture.alliance.allianceId))
            .json({ commissionIds: [c1, c2, c3], paidOn: businessDateOffset(0), reference: `REF-A-${round}` })
            .loginAs(admin!.user),
          client
            .post(payoutsUrl(fixture.alliance.allianceId))
            .json({ commissionIds: [c3, c2, c4], paidOn: businessDateOffset(0), reference: `REF-B-${round}` })
            .loginAs(admin!.user),
        ])

        const statuses = [a.status(), b.status()].sort((x, y) => x - y)
        assert.deepEqual(statuses, [201, 409])
        assert.notEqual(a.status(), 500)
        assert.notEqual(b.status(), 500)

        for (const commissionId of [c1, c2, c3, c4]) {
          const liveRows = await AlliancePayoutCommission.query()
            .where('alliance_commission_id', commissionId)
            .whereNull('alliance_payout_commission_annulled_at')
          assert.isAtMost(liveRows.length, 1)
        }
      } finally {
        await cleanupFixture({
          allianceId: fixture.alliance.allianceId,
          unitId: fixture.unit.businessUnitId,
          planId: fixture.planId,
        })
      }
    }
  }).timeout(60_000)

  test('CA-14: doble envío seguido del mismo cuerpo responde 201 y luego 409', async ({
    client,
    assert,
  }) => {
    const fixture = await createFixture('ca14')
    try {
      const commission = await addCommission({
        allianceId: fixture.alliance.allianceId,
        attributionId: fixture.attribution.allianceAttributionId,
        businessUnitId: fixture.unit.businessUnitId,
        subscriptionId: fixture.subscription.billingSubscriptionId,
        amountCents: 80_000,
        paidOn: businessDateOffset(-1),
      })
      const body = {
        commissionIds: [commission.allianceCommissionId],
        paidOn: businessDateOffset(0),
        reference: 'REF-doble-envio',
      }

      const first = await client.post(payoutsUrl(fixture.alliance.allianceId)).json(body).loginAs(admin!.user)
      first.assertStatus(201)

      const second = await client.post(payoutsUrl(fixture.alliance.allianceId)).json(body).loginAs(admin!.user)
      second.assertStatus(409)
      assert.equal(second.body().code, ALLIANCE_ERROR_CODES.COMMISSION_ALREADY_PAID)
    } finally {
      await cleanupFixture({
        allianceId: fixture.alliance.allianceId,
        unitId: fixture.unit.businessUnitId,
        planId: fixture.planId,
      })
    }
  })
})

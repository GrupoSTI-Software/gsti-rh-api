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
import BillingCatalogService from '#services/billing_catalog_service'
import { toBusinessDateString } from '#utils/business_date'

/**
 * Avance del plazo y monto acumulado en las 5 superficies de atribución
 * (USRH1787719056818). Lectura sobre comisiones ya escritas.
 */

const TEST_PASSWORD = 'AllianceAccrualProgress123!'
const BASE = '/api/platform/alliance-attributions'

interface TestActor {
  user: User
  person: Person
}

interface AccrualProgress {
  accrued: number
  remaining: number | null
  isAccruing: boolean
  reason: 'term_exhausted' | 'closed' | null
  amount: number
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

async function createActor(emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Progress',
    personLastname: 'Http',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin: true,
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
    businessUnitName: `Cliente avance ${label} ${stamp}`,
    businessUnitSlug: `attr-progress-${label}-${stamp}`,
    businessUnitLegalName: `Cliente avance ${label} Legal ${stamp}`,
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

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Alliance progress plan ${stamp}`,
    billingPlanDescription: 'Fixture USRH1787719056818',
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
    billingPaymentReference: `PROGRESS-${Date.now()}-${Math.random()}`,
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

async function cleanupCase(params: {
  businessUnitId: number
  allianceId: number
  planId?: number
}) {
  await AllianceCommission.query().where('business_unit_id', params.businessUnitId).delete()

  const subscriptions = await BillingSubscription.query()
    .withTrashed()
    .where('business_unit_id', params.businessUnitId)
  for (const subscription of subscriptions) {
    await BillingPayment.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .delete()
    await subscription.forceDelete()
  }

  await AllianceAttribution.query().where('business_unit_id', params.businessUnitId).delete()
  await Alliance.query().where('alliance_id', params.allianceId).delete()
  await BusinessUnit.query().where('business_unit_id', params.businessUnitId).delete()

  if (params.planId) {
    await BillingVolumeTier.query().where('billing_plan_id', params.planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', params.planId).delete()
    const plan = await BillingPlan.find(params.planId)
    if (plan) {
      await plan.delete()
    }
  }
}

function historyUrl(publicId: string): string {
  return `/api/platform/tenants/${publicId}/alliance-attributions`
}

function assertProgress(
  data: Record<string, unknown>,
  expected: AccrualProgress,
  assert: {
    equal: (a: unknown, b: unknown) => void
    isTrue: (v: unknown) => void
    isFalse: (v: unknown) => void
    isNull: (v: unknown) => void
  }
) {
  assert.equal(data.allianceAttributionAccruedPeriods, expected.accrued)
  assert.equal(data.allianceAttributionRemainingPeriods, expected.remaining)
  if (expected.isAccruing) {
    assert.isTrue(data.allianceAttributionIsAccruing)
  } else {
    assert.isFalse(data.allianceAttributionIsAccruing)
  }
  if (expected.reason === null) {
    assert.isNull(data.allianceAttributionNotAccruingReason)
  } else {
    assert.equal(data.allianceAttributionNotAccruingReason, expected.reason)
  }
  assert.equal(data.allianceAttributionAccruedAmountCents, expected.amount)
}

test.group('Avance del plazo y acumulado de la atribución', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('attr-progress')
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  test('CA-1: alta sin comisiones informa 0 / plazo / true / null / 0 en las lecturas', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const alliance = await createAllianceRow({
      name: `Avance alta ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('alta')

    try {
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
      const expected: AccrualProgress = {
        accrued: 0,
        remaining: 12,
        isAccruing: true,
        reason: null,
        amount: 0,
      }
      assertProgress(created.body().data, expected, assert)

      const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
      shown.assertStatus(200)
      assertProgress(shown.body().data, expected, assert)

      const listed = await client.get(historyUrl(unit.businessUnitPublicId)).loginAs(admin!.user)
      listed.assertStatus(200)
      assert.equal(listed.body().data.length, 1)
      assertProgress(listed.body().data[0], expected, assert)
    } finally {
      await cleanupCase({
        businessUnitId: unit.businessUnitId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('CA-2: tres comisiones de un periodo → 3 / 9 / true / null / suma', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Avance curso ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('curso')

    try {
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
      const subscription = await createSubscription(unit.businessUnitId, planId)
      const paidOn = toBusinessDateString()
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: id,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        amountCents: 80_000,
        paidOn,
      })
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: id,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        amountCents: 80_000,
        paidOn,
      })
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: id,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        amountCents: 80_000,
        paidOn,
      })

      const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
      shown.assertStatus(200)
      assertProgress(
        shown.body().data,
        { accrued: 3, remaining: 9, isAccruing: true, reason: null, amount: 240_000 },
        assert
      )
    } finally {
      await cleanupCase({
        businessUnitId: unit.businessUnitId,
        allianceId: alliance.allianceId,
        planId,
      })
    }
  })

  test('CA-3 y CA-10: agotada no cerrada; ampliar el plazo la reactiva', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Avance agotada ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('agotada')

    try {
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
      const subscription = await createSubscription(unit.businessUnitId, planId)
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: id,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 12,
        amountCents: 496_000,
        paidOn: toBusinessDateString(),
      })

      const exhausted = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
      exhausted.assertStatus(200)
      assert.isTrue(exhausted.body().data.allianceAttributionIsLive)
      assertProgress(
        exhausted.body().data,
        {
          accrued: 12,
          remaining: 0,
          isAccruing: false,
          reason: 'term_exhausted',
          amount: 496_000,
        },
        assert
      )

      const patched = await client
        .patch(`${BASE}/${id}`)
        .loginAs(admin!.user)
        .json({ allianceAttributionTermPeriods: 14 })
      patched.assertStatus(200)
      assertProgress(
        patched.body().data,
        { accrued: 12, remaining: 2, isAccruing: true, reason: null, amount: 496_000 },
        assert
      )
    } finally {
      await cleanupCase({
        businessUnitId: unit.businessUnitId,
        allianceId: alliance.allianceId,
        planId,
      })
    }
  })

  test('CA-4: cerrada gana sobre plazo agotado', async ({ client, assert }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Avance cerrada-agotada ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('cerrada-agotada')

    try {
      const startsAt = toBusinessDateString()
      const created = await client
        .post(BASE)
        .loginAs(admin!.user)
        .json({
          allianceId: alliance.allianceId,
          businessUnitPublicId: unit.businessUnitPublicId,
          allianceAttributionStartsAt: startsAt,
        })
      created.assertStatus(201)
      const id = created.body().data.allianceAttributionId as number
      const subscription = await createSubscription(unit.businessUnitId, planId)
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: id,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 12,
        amountCents: 496_000,
        paidOn: startsAt,
      })

      const closed = await client.post(`${BASE}/${id}/close`).loginAs(admin!.user).json({
        allianceAttributionClosedAt: startsAt,
        allianceAttributionCloseReason: 'Terminó el acuerdo',
      })
      closed.assertStatus(200)
      assert.isFalse(closed.body().data.allianceAttributionIsLive)
      assertProgress(
        closed.body().data,
        { accrued: 12, remaining: 0, isAccruing: false, reason: 'closed', amount: 496_000 },
        assert
      )
    } finally {
      await cleanupCase({
        businessUnitId: unit.businessUnitId,
        allianceId: alliance.allianceId,
        planId,
      })
    }
  })

  test('CA-5: cerrada sin agotar informa restantes y motivo closed', async ({ client, assert }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Avance cerrada ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('cerrada')

    try {
      const startsAt = toBusinessDateString()
      const created = await client
        .post(BASE)
        .loginAs(admin!.user)
        .json({
          allianceId: alliance.allianceId,
          businessUnitPublicId: unit.businessUnitPublicId,
          allianceAttributionStartsAt: startsAt,
        })
      created.assertStatus(201)
      const id = created.body().data.allianceAttributionId as number
      const subscription = await createSubscription(unit.businessUnitId, planId)
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: id,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 5,
        amountCents: 400_000,
        paidOn: startsAt,
      })

      const closed = await client.post(`${BASE}/${id}/close`).loginAs(admin!.user).json({
        allianceAttributionClosedAt: startsAt,
        allianceAttributionCloseReason: 'Cambio de alianza',
      })
      closed.assertStatus(200)
      assertProgress(
        closed.body().data,
        { accrued: 5, remaining: 7, isAccruing: false, reason: 'closed', amount: 400_000 },
        assert
      )
    } finally {
      await cleanupCase({
        businessUnitId: unit.businessUnitId,
        allianceId: alliance.allianceId,
        planId,
      })
    }
  })

  test('CA-6: plazo indeterminado nunca agota', async ({ client, assert }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Avance indeterminado ${stamp}`,
      percent: 10,
      term: null,
    })
    const unit = await createClientUnit('indeterminado')

    try {
      const created = await client
        .post(BASE)
        .loginAs(admin!.user)
        .json({
          allianceId: alliance.allianceId,
          businessUnitPublicId: unit.businessUnitPublicId,
          allianceAttributionStartsAt: toBusinessDateString(),
          allianceAttributionTermPeriods: null,
        })
      created.assertStatus(201)
      const id = created.body().data.allianceAttributionId as number
      const subscription = await createSubscription(unit.businessUnitId, planId)
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: id,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 30,
        amountCents: 2_400_000,
        paidOn: toBusinessDateString(),
      })

      const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
      shown.assertStatus(200)
      assert.isTrue(shown.body().data.allianceAttributionIsLive)
      assertProgress(
        shown.body().data,
        { accrued: 30, remaining: null, isAccruing: true, reason: null, amount: 2_400_000 },
        assert
      )
    } finally {
      await cleanupCase({
        businessUnitId: unit.businessUnitId,
        allianceId: alliance.allianceId,
        planId,
      })
    }
  })

  test('CA-7: alianza desactivada sigue generando', async ({ client, assert }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Avance inactiva ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('inactiva')

    try {
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
      alliance.allianceActive = 0
      await alliance.save()

      const subscription = await createSubscription(unit.businessUnitId, planId)
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: id,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 2,
        amountCents: 160_000,
        paidOn: toBusinessDateString(),
      })

      const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
      shown.assertStatus(200)
      assertProgress(
        shown.body().data,
        { accrued: 2, remaining: 10, isAccruing: true, reason: null, amount: 160_000 },
        assert
      )
    } finally {
      await cleanupCase({
        businessUnitId: unit.businessUnitId,
        allianceId: alliance.allianceId,
        planId,
      })
    }
  })

  test('CA-8: el listado de un cliente dispara una sola consulta agregada', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const alliance = await createAllianceRow({
      name: `Avance n+1 ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('nplus1')
    const startsAt = toBusinessDateString()

    try {
      for (let index = 0; index < 10; index++) {
        const created = await client
          .post(BASE)
          .loginAs(admin!.user)
          .json({
            allianceId: alliance.allianceId,
            businessUnitPublicId: unit.businessUnitPublicId,
            allianceAttributionStartsAt: startsAt,
          })
        created.assertStatus(201)
        const id = created.body().data.allianceAttributionId as number
        if (index < 9) {
          const closed = await client.post(`${BASE}/${id}/close`).loginAs(admin!.user).json({
            allianceAttributionClosedAt: startsAt,
            allianceAttributionCloseReason: `Cierre ${index + 1}`,
          })
          closed.assertStatus(200)
        }
      }

      const { result, sqls } = await withSqlLog(async () => {
        return client.get(historyUrl(unit.businessUnitPublicId)).loginAs(admin!.user)
      })
      result.assertStatus(200)
      assert.equal(result.body().data.length, 10)

      const commissionSqls = sqls.filter((sql) =>
        /from\s+[`"]?alliance_commissions[`"]?/i.test(sql)
      )
      assert.equal(commissionSqls.length, 1)
      assert.match(commissionSqls[0] ?? '', /alliance_attribution_id[`"]?\s+in\s+\(/i)
    } finally {
      await cleanupCase({
        businessUnitId: unit.businessUnitId,
        allianceId: alliance.allianceId,
      })
    }
  })

  test('CA-9: comisión con fecha posterior al cierre cuenta en el acumulado', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const alliance = await createAllianceRow({
      name: `Avance post-cierre ${stamp}`,
      percent: 10,
      term: 12,
    })
    const unit = await createClientUnit('post-cierre')
    const today = DateTime.fromISO(toBusinessDateString(), { zone: 'utc' })
    const startsAt = today.minus({ days: 10 }).toISODate() ?? ''
    const closedAt = today.minus({ days: 5 }).toISODate() ?? ''
    const paidOn = today.minus({ days: 1 }).toISODate() ?? ''

    try {
      const created = await client
        .post(BASE)
        .loginAs(admin!.user)
        .json({
          allianceId: alliance.allianceId,
          businessUnitPublicId: unit.businessUnitPublicId,
          allianceAttributionStartsAt: startsAt,
        })
      created.assertStatus(201)
      const id = created.body().data.allianceAttributionId as number

      const closed = await client.post(`${BASE}/${id}/close`).loginAs(admin!.user).json({
        allianceAttributionClosedAt: closedAt,
        allianceAttributionCloseReason: 'Cierre con comisión tardía',
      })
      closed.assertStatus(200)

      const subscription = await createSubscription(unit.businessUnitId, planId)
      await addCommission({
        allianceId: alliance.allianceId,
        attributionId: id,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 1,
        amountCents: 80_000,
        paidOn,
      })

      const shown = await client.get(`${BASE}/${id}`).loginAs(admin!.user)
      shown.assertStatus(200)
      assertProgress(
        shown.body().data,
        { accrued: 1, remaining: 11, isAccruing: false, reason: 'closed', amount: 80_000 },
        assert
      )
    } finally {
      await cleanupCase({
        businessUnitId: unit.businessUnitId,
        allianceId: alliance.allianceId,
        planId,
      })
    }
  })

  test('cada atribución del listado trae su propio acumulado, sin sumar alianzas', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const allianceA = await createAllianceRow({
      name: `Avance alianza A ${stamp}`,
      percent: 10,
      term: 12,
    })
    const allianceB = await createAllianceRow({
      name: `Avance alianza B ${stamp}`,
      percent: 8,
      term: 6,
    })
    const unit = await createClientUnit('dos-alianzas')
    const startsAt = toBusinessDateString()

    try {
      const first = await client
        .post(BASE)
        .loginAs(admin!.user)
        .json({
          allianceId: allianceB.allianceId,
          businessUnitPublicId: unit.businessUnitPublicId,
          allianceAttributionStartsAt: startsAt,
        })
      first.assertStatus(201)
      const closedId = first.body().data.allianceAttributionId as number
      const subscription = await createSubscription(unit.businessUnitId, planId)
      await addCommission({
        allianceId: allianceB.allianceId,
        attributionId: closedId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 2,
        amountCents: 50_000,
        paidOn: startsAt,
      })
      const closed = await client.post(`${BASE}/${closedId}/close`).loginAs(admin!.user).json({
        allianceAttributionClosedAt: startsAt,
        allianceAttributionCloseReason: 'Cambio a alianza A',
      })
      closed.assertStatus(200)

      const second = await client
        .post(BASE)
        .loginAs(admin!.user)
        .json({
          allianceId: allianceA.allianceId,
          businessUnitPublicId: unit.businessUnitPublicId,
          allianceAttributionStartsAt: startsAt,
        })
      second.assertStatus(201)
      const liveId = second.body().data.allianceAttributionId as number
      await addCommission({
        allianceId: allianceA.allianceId,
        attributionId: liveId,
        businessUnitId: unit.businessUnitId,
        subscriptionId: subscription.billingSubscriptionId,
        periods: 3,
        amountCents: 240_000,
        paidOn: startsAt,
      })

      const listed = await client.get(historyUrl(unit.businessUnitPublicId)).loginAs(admin!.user)
      listed.assertStatus(200)
      const rows = listed.body().data as Array<{
        allianceAttributionId: number
        allianceAttributionAccruedAmountCents: number
      }>
      const liveRow = rows.find((row) => row.allianceAttributionId === liveId)
      const closedRow = rows.find((row) => row.allianceAttributionId === closedId)
      assert.equal(liveRow?.allianceAttributionAccruedAmountCents, 240_000)
      assert.equal(closedRow?.allianceAttributionAccruedAmountCents, 50_000)
    } finally {
      await AllianceCommission.query().where('business_unit_id', unit.businessUnitId).delete()
      const subscriptions = await BillingSubscription.query()
        .withTrashed()
        .where('business_unit_id', unit.businessUnitId)
      for (const subscription of subscriptions) {
        await BillingPayment.query()
          .where('billing_subscription_id', subscription.billingSubscriptionId)
          .delete()
        await subscription.forceDelete()
      }
      await AllianceAttribution.query().where('business_unit_id', unit.businessUnitId).delete()
      await Alliance.query()
        .whereIn('alliance_id', [allianceA.allianceId, allianceB.allianceId])
        .delete()
      await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
      await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
      await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
      const plan = await BillingPlan.find(planId)
      if (plan) {
        await plan.delete()
      }
    }
  })
})

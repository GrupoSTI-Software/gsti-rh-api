import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription, { type BillingSubscriptionStatus } from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import BillingPayment from '#models/billing_payment'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'

/**
 * USRH1785962095095 v2 — Aviso de adeudo pendiente en el detalle de suscripción.
 *
 * El detalle (`getSubscriptionDetail`, consumido por
 * `GET /api/platform/billing/subscriptions/:id`) expone `pendingIncreaseChange`
 * con el cambio de aumento en `pending_payment`, para que el drawer de
 * registro de pago del landlord lo muestre en una línea sin calcular cifras
 * propias. `null` cuando no hay adeudo vivo.
 */
const UNIT_AMOUNT = 100
const EMPLOYEES = 100
const NEW_EMPLOYEES = 150
const DISCOUNT_PERCENT = 0
const TAX_RATE = 0.16
const CONTRACTED_TOTAL = 11_600
const NEW_CONTRACTED_TOTAL = 17_400
const PRORATED_CENTS = 150_000

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Pending Increase Detail Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1785962095095 v2',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: UNIT_AMOUNT,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: TAX_RATE,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: DISCOUNT_PERCENT,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: number, suffix: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Pending Increase Detail BU ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `pending-increase-detail-bu-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = `Pending Increase Detail Legal ${suffix} ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

interface SubscriptionFixture {
  businessUnitId: number
  billingPlanId: number
  status: BillingSubscriptionStatus
}

async function createSubscription(fixture: SubscriptionFixture): Promise<BillingSubscription> {
  const now = DateTime.now()
  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', fixture.billingPlanId)
    .firstOrFail()

  return BillingSubscription.create({
    businessUnitId: fixture.businessUnitId,
    billingPlanId: fixture.billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: fixture.status,
    billingSubscriptionContractedUnitAmount: UNIT_AMOUNT,
    billingSubscriptionContractedEmployees: EMPLOYEES,
    billingSubscriptionDiscountPercent: DISCOUNT_PERCENT,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: TAX_RATE,
    billingSubscriptionContractedSubtotal: CONTRACTED_TOTAL / 1.16,
    billingSubscriptionContractedTaxAmount: CONTRACTED_TOTAL - CONTRACTED_TOTAL / 1.16,
    billingSubscriptionContractedTotal: CONTRACTED_TOTAL,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd: now,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: fixture.businessUnitId,
  })
}

async function createPendingIncrease(
  subscription: BillingSubscription
): Promise<BillingSubscriptionChange> {
  return BillingSubscriptionChange.create({
    billingSubscriptionId: subscription.billingSubscriptionId,
    businessUnitId: subscription.businessUnitId,
    billingSubscriptionChangeType: 'increase',
    billingSubscriptionChangeStatus: 'pending_payment',
    billingSubscriptionChangePreviousEmployees: EMPLOYEES,
    billingSubscriptionChangeNewEmployees: NEW_EMPLOYEES,
    billingSubscriptionChangeUnitAmount: UNIT_AMOUNT,
    billingSubscriptionChangeDiscountPercent: DISCOUNT_PERCENT,
    billingSubscriptionChangeTaxRate: TAX_RATE,
    billingSubscriptionChangeSubtotal: NEW_CONTRACTED_TOTAL / 1.16,
    billingSubscriptionChangeTaxAmount: NEW_CONTRACTED_TOTAL - NEW_CONTRACTED_TOTAL / 1.16,
    billingSubscriptionChangeTotal: NEW_CONTRACTED_TOTAL,
    billingSubscriptionChangeProratedAmountCents: PRORATED_CENTS,
    billingSubscriptionChangeEffectiveAt: null,
    billingSubscriptionChangeAppliedAt: null,
    billingSubscriptionChangeBillingPaymentId: null,
    billingSubscriptionChangeNotApplicableReason: null,
  })
}

async function cleanup(businessUnitIds: number[], planIds: number[]) {
  for (const businessUnitId of businessUnitIds) {
    const subscriptions = await BillingSubscription.query()
      .withTrashed()
      .where('business_unit_id', businessUnitId)
    for (const subscription of subscriptions) {
      await BillingSubscriptionChange.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .update({ billingSubscriptionChangeBillingPaymentId: null })
      await BillingPayment.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .delete()
      await BillingSubscriptionChange.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .delete()
      await subscription.forceDelete()
    }
    await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  }
  for (const planId of planIds) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) {
      await plan.delete()
    }
  }
}

test.group('BillingSubscriptionService.getSubscriptionDetail — aviso de adeudo (USRH1785962095095 v2)', () => {
  test('con aumento pendiente, expone pendingIncreaseChange con el monto congelado', async ({
    assert,
  }) => {
    const stamp = Date.now() + 950
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'with-debt')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
    })
    const change = await createPendingIncrease(subscription)

    try {
      const service = new BillingSubscriptionService()
      const detail = await service.getSubscriptionDetail(subscription.billingSubscriptionId)

      assert.isNotNull(detail.pendingIncreaseChange)
      assert.equal(
        detail.pendingIncreaseChange!.billingSubscriptionChangeId,
        change.billingSubscriptionChangeId
      )
      assert.equal(detail.pendingIncreaseChange!.billingSubscriptionChangeStatus, 'pending_payment')
      assert.equal(detail.pendingIncreaseChange!.billingSubscriptionChangeType, 'increase')
      assert.equal(
        detail.pendingIncreaseChange!.billingSubscriptionChangeProratedAmountCents,
        PRORATED_CENTS
      )
      assert.equal(detail.pendingIncreaseChange!.billingSubscriptionChangePreviousEmployees, EMPLOYEES)
      assert.equal(
        detail.pendingIncreaseChange!.billingSubscriptionChangeNewEmployees,
        NEW_EMPLOYEES
      )
      // Serialización natural del modelo sigue presente (no se reemplaza el shape existente).
      assert.equal(detail.billingSubscriptionId, subscription.billingSubscriptionId)
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('sin aumento pendiente, pendingIncreaseChange es null', async ({ assert }) => {
    const stamp = Date.now() + 951
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'no-debt')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'active',
    })

    try {
      const service = new BillingSubscriptionService()
      const detail = await service.getSubscriptionDetail(subscription.billingSubscriptionId)

      assert.isNull(detail.pendingIncreaseChange)
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('el adeudo aplicado (applied) deja de mostrarse en el siguiente detalle', async ({
    assert,
  }) => {
    const stamp = Date.now() + 952
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'applied-debt')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
    })
    const change = await createPendingIncrease(subscription)

    try {
      const service = new BillingSubscriptionService()
      const before = await service.getSubscriptionDetail(subscription.billingSubscriptionId)
      assert.isNotNull(before.pendingIncreaseChange)

      // Simula el efecto de un pago que cubre el adeudo (regla 13): el cambio
      // pasa a `applied`. El landlord no necesita recalcular nada más: en la
      // siguiente lectura del detalle el aviso desaparece solo.
      change.billingSubscriptionChangeStatus = 'applied'
      change.billingSubscriptionChangeAppliedAt = DateTime.now()
      await change.save()

      const after = await service.getSubscriptionDetail(subscription.billingSubscriptionId)
      assert.isNull(after.pendingIncreaseChange)
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })
})

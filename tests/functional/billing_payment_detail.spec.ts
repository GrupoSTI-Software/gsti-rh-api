import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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
import BillingPaymentService from '#services/billing_payment_service'
import { BillingPaymentServiceError } from '../../app/exceptions/billing_payment_service_error.js'

/**
 * USRH1785962095098 — Mostrar el detalle financiero del pago y el saldo a
 * favor. Cubre los criterios Gherkin del spec (§7): desglose completo,
 * supervivencia a un cambio de plan, pago sin desglose disponible (pagos
 * anteriores a USRH1785962095095), pago inexistente/ajeno a la suscripción
 * y suscripción inexistente.
 *
 * Trato congelado fijo: unitAmount=100, employees=100, discount=0%, taxRate=0.16
 *   → montoDelPeriodo = 1,160,000 centavos
 */
const UNIT_AMOUNT = 100
const EMPLOYEES = 100
const DISCOUNT_PERCENT = 0
const TAX_RATE = 0.16
const CONTRACTED_TOTAL = 11_600
const PERIOD_AMOUNT_CENTS = 1_160_000

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Payment Detail Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1785962095098',
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
  businessUnit.businessUnitName = `Payment Detail BU ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `payment-detail-bu-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = `Payment Detail Legal ${suffix} ${stamp}`
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

/** Simula un pago anterior a USRH1785962095095, tal como lo dejó la migración: sin foto financiera. */
async function createLegacyPayment(subscription: BillingSubscription): Promise<BillingPayment> {
  return BillingPayment.create({
    billingSubscriptionId: subscription.billingSubscriptionId,
    billingPaymentAmountCents: PERIOD_AMOUNT_CENTS,
    billingPaymentPeriodAmountCents: 0,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: 0,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: 0,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: 0,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: 'LEGACY-REF',
    billingPaymentReceiptPath: 'billing/payments/receipts/legacy.pdf',
    billingPaymentReceiptMime: 'application/pdf',
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.now().minus({ months: 2 }),
    billingPaymentPeriodStart: DateTime.now().minus({ months: 2 }),
    billingPaymentPeriodEnd: DateTime.now().minus({ months: 1 }),
  })
}

async function makeReceipt(): Promise<{ tmpPath: string; cleanup: () => Promise<void> }> {
  const tmpPath = path.join(os.tmpdir(), `payment-detail-receipt-${Date.now()}-${Math.random()}.pdf`)
  await fs.writeFile(tmpPath, Buffer.from('%PDF-1.4\n%%EOF'))
  return {
    tmpPath,
    cleanup: () => fs.unlink(tmpPath).catch(() => undefined),
  }
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

test.group('BillingPaymentService.getPaymentDetail (USRH1785962095098)', () => {
  test('Criterio 1 — desglose completo de un pago gobernado', async ({ assert }) => {
    const stamp = Date.now() + 1000
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'full-breakdown')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      const registered = await service.registerPayment(
        subscription.billingSubscriptionId,
        { method: 'transfer', reference: 'DETAIL-1', paidAt: DateTime.now().toISO()! },
        {
          tmpPath: receipt.tmpPath,
          clientName: 'comprobante.pdf',
          size: 20,
          headers: { 'content-type': 'application/pdf' },
        }
      )

      const detail = await service.getPaymentDetail(
        subscription.billingSubscriptionId,
        registered.billingPaymentId
      )

      assert.equal(detail.billingPaymentId, registered.billingPaymentId)
      assert.equal(detail.amountCents, PERIOD_AMOUNT_CENTS)
      assert.equal(detail.periodsCovered, 1)
      assert.equal(detail.periodAmountCents, PERIOD_AMOUNT_CENTS)
      assert.equal(detail.creditAppliedCents, PERIOD_AMOUNT_CENTS)
      assert.equal(detail.debtAppliedCents, 0)
      assert.equal(detail.creditBalanceAfterCents, 0)
      assert.isTrue(detail.breakdownAvailable)
      assert.isNotNull(detail.breakdown)
      assert.equal(detail.breakdown!.totalCents, CONTRACTED_TOTAL * 100)
      assert.equal(detail.breakdown!.subtotalCents, Math.round((CONTRACTED_TOTAL / 1.16) * 100))
      assert.equal(detail.breakdown!.taxRate, TAX_RATE)
      assert.equal(detail.breakdown!.discountPercent, DISCOUNT_PERCENT)
      // periodAmountCents y breakdown.totalCents son el mismo importe por construcción.
      assert.equal(detail.periodAmountCents, detail.breakdown!.totalCents)
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 2 — el desglose sobrevive a un cambio de plan posterior', async ({ assert }) => {
    const stamp = Date.now() + 1001
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'survives-plan-change')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      const registered = await service.registerPayment(
        subscription.billingSubscriptionId,
        { method: 'transfer', reference: 'DETAIL-2', paidAt: DateTime.now().toISO()! },
        {
          tmpPath: receipt.tmpPath,
          clientName: 'comprobante.pdf',
          size: 20,
          headers: { 'content-type': 'application/pdf' },
        }
      )

      // Simula el cambio de plan: reescribe el trato congelado vigente de la suscripción.
      const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      reloaded.billingSubscriptionContractedUnitAmount = 250
      reloaded.billingSubscriptionContractedTotal = 29_000
      await reloaded.save()

      const detail = await service.getPaymentDetail(
        subscription.billingSubscriptionId,
        registered.billingPaymentId
      )

      // Las cifras del pago siguen siendo las del trato vigente AL MOMENTO del pago.
      assert.equal(detail.breakdown!.totalCents, CONTRACTED_TOTAL * 100)
      assert.notEqual(detail.breakdown!.totalCents, 29_000 * 100)
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 4 — pago sin desglose disponible (anterior a USRH1785962095095)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 1002
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'legacy-no-breakdown')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'active',
    })
    const legacyPayment = await createLegacyPayment(subscription)

    try {
      const service = new BillingPaymentService()
      const detail = await service.getPaymentDetail(
        subscription.billingSubscriptionId,
        legacyPayment.billingPaymentId
      )

      // Lo que sí tiene se muestra tal cual.
      assert.equal(detail.amountCents, PERIOD_AMOUNT_CENTS)
      assert.equal(detail.reference, 'LEGACY-REF')
      assert.isTrue(detail.receiptAvailable)
      // El marcador honesto: no ceros como si fueran datos reales.
      assert.isFalse(detail.breakdownAvailable)
      assert.isNull(detail.breakdown)
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 5 — pago inexistente responde NOT_FOUND', async ({ assert }) => {
    const stamp = Date.now() + 1003
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'missing-payment')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'active',
    })

    try {
      const service = new BillingPaymentService()
      let thrown: unknown = null
      try {
        await service.getPaymentDetail(subscription.billingSubscriptionId, 999_999_999)
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, BillingPaymentServiceError)
      assert.equal((thrown as BillingPaymentServiceError).errorCode, 'PLT.PAY.NOT_FOUND')
      assert.equal((thrown as BillingPaymentServiceError).httpStatus, 404)
      assert.equal((thrown as BillingPaymentServiceError).key, 'pago-no-encontrado')
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 5 — pago de otra suscripción responde NOT_FOUND (sin distinguir el caso)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 1004
    const planId = await createPublishedPlan(stamp)
    const buA = await createBusinessUnit(stamp, 'owner-a')
    const buB = await createBusinessUnit(stamp, 'owner-b')
    const subscriptionA = await createSubscription({
      businessUnitId: buA.businessUnitId,
      billingPlanId: planId,
      status: 'active',
    })
    const subscriptionB = await createSubscription({
      businessUnitId: buB.businessUnitId,
      billingPlanId: planId,
      status: 'active',
    })
    const paymentOfA = await createLegacyPayment(subscriptionA)

    try {
      const service = new BillingPaymentService()
      let thrown: unknown = null
      try {
        // Pide el pago de A usando el subscriptionId de B.
        await service.getPaymentDetail(subscriptionB.billingSubscriptionId, paymentOfA.billingPaymentId)
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, BillingPaymentServiceError)
      assert.equal((thrown as BillingPaymentServiceError).errorCode, 'PLT.PAY.NOT_FOUND')
      assert.equal((thrown as BillingPaymentServiceError).key, 'pago-no-encontrado')
    } finally {
      await cleanup([buA.businessUnitId, buB.businessUnitId], [planId])
    }
  })

  test('Criterio 6 — suscripción inexistente responde SUBSCRIPTION_NOT_FOUND', async ({
    assert,
  }) => {
    const service = new BillingPaymentService()
    let thrown: unknown = null
    try {
      await service.getPaymentDetail(999_999_999, 1)
    } catch (error) {
      thrown = error
    }

    assert.instanceOf(thrown, BillingPaymentServiceError)
    assert.equal((thrown as BillingPaymentServiceError).errorCode, 'PLT.PAY.SUBSCRIPTION_NOT_FOUND')
    assert.equal((thrown as BillingPaymentServiceError).key, 'suscripcion-no-encontrada')
  })

  test('periodsCovered viaja en el listado del histórico', async ({ assert }) => {
    const stamp = Date.now() + 1005
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'list-periods-covered')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      await service.registerPayment(
        subscription.billingSubscriptionId,
        { method: 'transfer', reference: 'LIST-1', paidAt: DateTime.now().toISO()! },
        {
          tmpPath: receipt.tmpPath,
          clientName: 'comprobante.pdf',
          size: 20,
          headers: { 'content-type': 'application/pdf' },
        }
      )

      const { data } = await service.listPayments(subscription.billingSubscriptionId)
      assert.lengthOf(data, 1)
      assert.equal(data[0].periodsCovered, 1)
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })
})

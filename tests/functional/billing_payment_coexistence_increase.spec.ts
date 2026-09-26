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

/**
 * USRH1785962095095 v2 — Convivencia con USRH1786107870856 (José Soto).
 * Cubre los criterios 12 a 15 del spec v2: prelación de cobro, el monto
 * asentado vs. el monto del periodo cuando hay aumento, el estado tras
 * cubrir solo el adeudo, y la regresión del cobro doble.
 *
 * Trato congelado fijo (igual al resto de la suite de USRH1785962095095):
 * unitAmount=100, employees=100, discount=0%, taxRate=0.16
 *   → montoDelPeriodo (100 empleados) = 1,160,000 centavos
 * El aumento pedido es a 150 empleados con el mismo precio unitario:
 *   → montoDelPeriodo (150 empleados) = 1,740,000 centavos
 */
const UNIT_AMOUNT = 100
const EMPLOYEES = 100
const NEW_EMPLOYEES = 150
const DISCOUNT_PERCENT = 0
const TAX_RATE = 0.16
const CONTRACTED_TOTAL = 11_600 // = 100 * 100 * 1.16
const PERIOD_AMOUNT_CENTS = 1_160_000
const NEW_CONTRACTED_TOTAL = 17_400 // = 100 * 150 * 1.16
const NEW_PERIOD_AMOUNT_CENTS = 1_740_000
const PRORATED_CENTS = 150_000

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Coexistence Plan ${stamp}`,
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
  businessUnit.businessUnitName = `Coexistence BU ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `coexistence-bu-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = `Coexistence Legal ${suffix} ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

interface SubscriptionFixture {
  businessUnitId: number
  billingPlanId: number
  status: BillingSubscriptionStatus
  creditBalanceCents?: number
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
    billingSubscriptionCreditBalanceCents: fixture.creditBalanceCents ?? 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd: now,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: fixture.businessUnitId,
  })
}

/** Cambio `increase` pendiente de pago, con snapshot congelado consistente (v2). */
async function createPendingIncrease(
  subscription: BillingSubscription,
  proratedCents = PRORATED_CENTS
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
    billingSubscriptionChangeProratedAmountCents: proratedCents,
    billingSubscriptionChangeEffectiveAt: null,
    billingSubscriptionChangeAppliedAt: null,
    billingSubscriptionChangeBillingPaymentId: null,
    billingSubscriptionChangeNotApplicableReason: null,
  })
}

async function makeReceipt(): Promise<{ tmpPath: string; cleanup: () => Promise<void> }> {
  const tmpPath = path.join(os.tmpdir(), `coexistence-receipt-${Date.now()}-${Math.random()}.pdf`)
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

test.group(
  'BillingPaymentService.registerPayment — convivencia con el aumento (USRH1785962095095 v2)',
  () => {
    test('Criterio 12 — pago que sólo cubre el adeudo del aumento (reglas 13, 15)', async ({
      assert,
    }) => {
      const stamp = Date.now() + 900
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'debt-only')
      const subscription = await createSubscription({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'past_due',
      })
      const change = await createPendingIncrease(subscription)
      const receipt = await makeReceipt()

      const service = new BillingPaymentService()
      try {
        const result = await service.registerPayment(
          subscription.billingSubscriptionId,
          {
            amountCents: PRORATED_CENTS,
            allowCustomAmount: true,
            method: 'transfer',
            reference: 'DEBT-ONLY',
            paidAt: DateTime.now().toISO()!,
          },
          {
            tmpPath: receipt.tmpPath,
            clientName: 'comprobante.pdf',
            size: 20,
            headers: { 'content-type': 'application/pdf' },
          }
        )

        assert.isNotNull(result.appliedChange)
        assert.equal(result.appliedChange!.billingSubscriptionChangeStatus, 'applied')
        assert.equal(result.debtAppliedCents, PRORATED_CENTS)
        assert.equal(result.periodsCovered, 0)
        assert.equal(result.creditAppliedCents, 0)
        assert.equal(result.creditBalanceAfterCents, 0)
        assert.isNull(result.periodStart)
        assert.isNull(result.periodEnd)
        // Regla 15: cubrir solo el adeudo NO pone al corriente.
        assert.equal(result.subscription.status, 'past_due')
        assert.equal(result.subscription.creditBalanceCents, 0)

        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionContractedEmployees, NEW_EMPLOYEES)

        const reloadedChange = await BillingSubscriptionChange.findOrFail(
          change.billingSubscriptionChangeId
        )
        assert.equal(reloadedChange.billingSubscriptionChangeStatus, 'applied')
      } finally {
        await receipt.cleanup()
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('Criterio 13 — un solo pago cubre adeudo y periodo, en ese orden (reglas 13, 14)', async ({
      assert,
    }) => {
      const stamp = Date.now() + 901
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'debt-and-period')
      const subscription = await createSubscription({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'past_due',
      })
      await createPendingIncrease(subscription)
      const receipt = await makeReceipt()

      // adeudo (150000) + 1 periodo AL PRECIO NUEVO (1,740,000) = 1,890,000
      const amountCents = PRORATED_CENTS + NEW_PERIOD_AMOUNT_CENTS

      const service = new BillingPaymentService()
      try {
        const result = await service.registerPayment(
          subscription.billingSubscriptionId,
          {
            amountCents,
            allowCustomAmount: true,
            method: 'transfer',
            reference: 'DEBT-AND-PERIOD',
            paidAt: DateTime.now().toISO()!,
          },
          {
            tmpPath: receipt.tmpPath,
            clientName: 'comprobante.pdf',
            size: 20,
            headers: { 'content-type': 'application/pdf' },
          }
        )

        assert.equal(result.debtAppliedCents, PRORATED_CENTS)
        // El monto del periodo usado para extender es el NUEVO, no el viejo.
        assert.equal(result.periodAmountCents, NEW_PERIOD_AMOUNT_CENTS)
        assert.equal(result.periodsCovered, 1)
        assert.equal(result.creditAppliedCents, NEW_PERIOD_AMOUNT_CENTS)
        assert.equal(result.creditBalanceAfterCents, 0)
        assert.equal(result.subscription.status, 'active')
        assert.isNotNull(result.periodStart)
        assert.isNotNull(result.periodEnd)
      } finally {
        await receipt.cleanup()
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('Criterio 14 — el dinero no se gasta dos veces (regla 13, regresión)', async ({
      assert,
    }) => {
      const stamp = Date.now() + 902
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'no-double-spend')
      const subscription = await createSubscription({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'past_due',
      })
      await createPendingIncrease(subscription)
      const receipt = await makeReceipt()

      const service = new BillingPaymentService()
      try {
        const result = await service.registerPayment(
          subscription.billingSubscriptionId,
          {
            amountCents: PRORATED_CENTS,
            allowCustomAmount: true,
            method: 'transfer',
            reference: 'NO-DOUBLE-SPEND',
            paidAt: DateTime.now().toISO()!,
          },
          {
            tmpPath: receipt.tmpPath,
            clientName: 'comprobante.pdf',
            size: 20,
            headers: { 'content-type': 'application/pdf' },
          }
        )

        // Es exactamente el defecto que produciría implementar la v1 sobre multitenant:
        // el saldo final debe ser 0, NUNCA 150000 (el dinero del adeudo no entra al saldo).
        assert.equal(result.creditBalanceAfterCents, 0)
        assert.equal(result.subscription.creditBalanceCents, 0)
        assert.equal(result.periodStart, null)

        // Invariante: saldoPrevio + montoAsentado = debtApplied + creditApplied + creditBalanceAfter
        assert.equal(
          0 + PRORATED_CENTS,
          result.debtAppliedCents + result.creditAppliedCents + result.creditBalanceAfterCents
        )
      } finally {
        await receipt.cleanup()
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('Criterio 15 — sin aumento pendiente nada cambia (regla 13)', async ({ assert }) => {
      const stamp = Date.now() + 903
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'no-pending-change')
      const subscription = await createSubscription({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'past_due',
      })
      const receipt = await makeReceipt()

      const service = new BillingPaymentService()
      try {
        const result = await service.registerPayment(
          subscription.billingSubscriptionId,
          { method: 'transfer', reference: 'NO-PENDING-CHANGE', paidAt: DateTime.now().toISO()! },
          {
            tmpPath: receipt.tmpPath,
            clientName: 'comprobante.pdf',
            size: 20,
            headers: { 'content-type': 'application/pdf' },
          }
        )

        assert.equal(result.debtAppliedCents, 0)
        assert.isNull(result.appliedChange)
        assert.equal(result.amountCents, PERIOD_AMOUNT_CENTS)
        assert.equal(result.periodsCovered, 1)
        assert.equal(result.creditAppliedCents, PERIOD_AMOUNT_CENTS)
        assert.equal(result.creditBalanceAfterCents, 0)
        assert.equal(result.subscription.status, 'active')
      } finally {
        await receipt.cleanup()
        await cleanup([bu.businessUnitId], [planId])
      }
    })
  }
)

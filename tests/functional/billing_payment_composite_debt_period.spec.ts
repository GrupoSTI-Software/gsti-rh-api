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
import { BILLING_PAYMENT_ERROR_CODES } from '../../app/constants/billing_payment_error_codes.js'

/**
 * USRH1787077544537 — Cobrar en un solo acto el adeudo y el periodo.
 *
 * Decisiones de Wilvardo:
 *   1. El monto sigue siendo el campo de siempre (`amountCents`), sin
 *      `allowCustomAmount`. El flujo normal acepta ahora, además del monto del
 *      periodo, exactamente dos cifras más cuando hay un aumento
 *      `pending_payment` vivo: el adeudo solo, o el adeudo + un periodo
 *      completo al precio nuevo.
 *   2. Si ese aumento deja de estar vigente entre que se lee y se confirma el
 *      pago, se rechaza (`PLT.PAY.PENDING_INCREASE_STALE`); nunca se degrada
 *      en silencio al monto del periodo.
 *
 * Trato congelado (igual al resto de la suite de USRH1785962095095):
 * unitAmount=100, employees=100, discount=0%, taxRate=0.16
 *   → montoDelPeriodo (100 empleados) = 1,160,000 centavos
 * Aumento a 150 empleados con el mismo precio unitario:
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
const DEBT_PLUS_PERIOD_CENTS = PRORATED_CENTS + NEW_PERIOD_AMOUNT_CENTS

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Composite Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1787077544537',
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
  businessUnit.businessUnitName = `Composite BU ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `composite-bu-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = `Composite Legal ${suffix} ${stamp}`
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
  const tmpPath = path.join(os.tmpdir(), `composite-receipt-${Date.now()}-${Math.random()}.pdf`)
  await fs.writeFile(tmpPath, Buffer.from('%PDF-1.4\n%%EOF'))
  return {
    tmpPath,
    cleanup: () => fs.unlink(tmpPath).catch(() => undefined),
  }
}

function receiptInput(receipt: { tmpPath: string }) {
  return {
    tmpPath: receipt.tmpPath,
    clientName: 'comprobante.pdf',
    size: 20,
    headers: { 'content-type': 'application/pdf' },
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
  'BillingPaymentService.registerPayment — cobro compuesto adeudo+periodo (USRH1787077544537)',
  () => {
    test('acepta amountCents = adeudo solo SIN allowCustomAmount', async ({ assert }) => {
      const stamp = Date.now() + 1000
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'debt-only-governed')
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
            method: 'transfer',
            reference: 'DEBT-ONLY-GOVERNED',
            paidAt: DateTime.now().toISO()!,
          },
          receiptInput(receipt)
        )

        assert.isFalse(result.isCustomAmount)
        assert.equal(result.debtAppliedCents, PRORATED_CENTS)
        assert.equal(result.periodsCovered, 0)
        assert.equal(result.subscription.status, 'past_due')
      } finally {
        await receipt.cleanup()
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('acepta amountCents = adeudo + periodo nuevo SIN allowCustomAmount', async ({
      assert,
    }) => {
      const stamp = Date.now() + 1001
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'debt-plus-period-governed')
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
            amountCents: DEBT_PLUS_PERIOD_CENTS,
            method: 'transfer',
            reference: 'DEBT-PLUS-PERIOD-GOVERNED',
            paidAt: DateTime.now().toISO()!,
          },
          receiptInput(receipt)
        )

        assert.isFalse(result.isCustomAmount)
        assert.equal(result.debtAppliedCents, PRORATED_CENTS)
        assert.equal(result.periodAmountCents, NEW_PERIOD_AMOUNT_CENTS)
        assert.equal(result.periodsCovered, 1)
        assert.equal(result.creditAppliedCents, NEW_PERIOD_AMOUNT_CENTS)
        assert.equal(result.creditBalanceAfterCents, 0)
        assert.equal(result.subscription.status, 'active')
      } finally {
        await receipt.cleanup()
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('rechaza el monto compuesto cuando el aumento quedó desfasado (base de cantidad cambió, decisión Wilvardo: nunca degradar en silencio)', async ({
      assert,
    }) => {
      const stamp = Date.now() + 1002
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'stale-base-drift')
      const subscription = await createSubscription({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'past_due',
      })
      await createPendingIncrease(subscription)
      const receipt = await makeReceipt()

      const service = new BillingPaymentService()
      try {
        // Entre que la pantalla mostró las opciones (adeudo/adeudo+periodo,
        // calculadas sobre una base de 100 empleados) y que el operador
        // confirma, algo más movió la plantilla contratada de la suscripción
        // (p.ej. otro flujo concurrente). El aumento pendiente sigue
        // `pending_payment` en BD, pero su base ya no coincide: el mismo
        // desfase que `applyIncreaseOnPayment` ya detecta como
        // `base-de-cantidad-desfasada` (0856).
        subscription.billingSubscriptionContractedEmployees = 120
        await subscription.save()

        let thrown: unknown
        try {
          await service.registerPayment(
            subscription.billingSubscriptionId,
            {
              amountCents: DEBT_PLUS_PERIOD_CENTS,
              method: 'transfer',
              reference: 'STALE-BASE-DRIFT',
              paidAt: DateTime.now().toISO()!,
            },
            receiptInput(receipt)
          )
        } catch (error) {
          thrown = error
        }

        assert.instanceOf(thrown, BillingPaymentServiceError)
        assert.equal(
          (thrown as BillingPaymentServiceError).errorCode,
          BILLING_PAYMENT_ERROR_CODES.PENDING_INCREASE_STALE
        )

        // Rollback total: no debe haber quedado ningún pago asentado.
        const payments = await BillingPayment.query().where(
          'billing_subscription_id',
          subscription.billingSubscriptionId
        )
        assert.lengthOf(payments, 0)
      } finally {
        await receipt.cleanup()
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('rechaza el monto de solo adeudo cuando nunca hubo aumento pendiente', async ({
      assert,
    }) => {
      const stamp = Date.now() + 1003
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'no-pending-increase')
      const subscription = await createSubscription({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'past_due',
      })
      const receipt = await makeReceipt()

      const service = new BillingPaymentService()
      try {
        let thrown: unknown
        try {
          await service.registerPayment(
            subscription.billingSubscriptionId,
            {
              amountCents: PRORATED_CENTS,
              method: 'transfer',
              reference: 'NO-PENDING-INCREASE',
              paidAt: DateTime.now().toISO()!,
            },
            receiptInput(receipt)
          )
        } catch (error) {
          thrown = error
        }

        assert.instanceOf(thrown, BillingPaymentServiceError)
        assert.equal(
          (thrown as BillingPaymentServiceError).errorCode,
          BILLING_PAYMENT_ERROR_CODES.AMOUNT_NOT_ALLOWED
        )
      } finally {
        await receipt.cleanup()
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('el monto del periodo viejo sigue siendo un monto gobernado válido (kind=period, no exige que el aumento esté vivo)', async ({
      assert,
    }) => {
      const stamp = Date.now() + 1004
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'plain-period-still-valid')
      const subscription = await createSubscription({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'past_due',
      })
      await createPendingIncrease(subscription)
      const receipt = await makeReceipt()

      const service = new BillingPaymentService()
      try {
        // El monto viejo del periodo alcanza para cubrir el adeudo (menor) y
        // deja un sobrante que no llega a cubrir un periodo al precio nuevo:
        // se aplica el aumento (había saldo de sobra) pero no se avanza el
        // periodo. Esto es prelación de cobro normal (regla 13), no depende
        // de si el cliente "eligió" el monto viejo o el nuevo — el monto
        // viejo del periodo también es una cifra gobernada válida sin
        // allowCustomAmount (kind=period).
        const result = await service.registerPayment(
          subscription.billingSubscriptionId,
          {
            amountCents: PERIOD_AMOUNT_CENTS,
            method: 'transfer',
            reference: 'PLAIN-PERIOD',
            paidAt: DateTime.now().toISO()!,
          },
          receiptInput(receipt)
        )

        assert.isFalse(result.isCustomAmount)
        assert.equal(result.debtAppliedCents, PRORATED_CENTS)
        assert.isNotNull(result.appliedChange)
        assert.equal(result.periodsCovered, 0)
        assert.equal(result.creditBalanceAfterCents, PERIOD_AMOUNT_CENTS - PRORATED_CENTS)
        assert.equal(result.subscription.status, 'past_due')
      } finally {
        await receipt.cleanup()
        await cleanup([bu.businessUnitId], [planId])
      }
    })
  }
)

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
import BillingPayment from '#models/billing_payment'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingPaymentService from '#services/billing_payment_service'
import { BillingPaymentServiceError } from '../../app/exceptions/billing_payment_service_error.js'

/**
 * USRH1785962095095 — Pagos gobernados: monto no editable y saldo
 * acumulable por periodos. Ejercita `BillingPaymentService.registerPayment`
 * directamente contra la base de datos real (mismo criterio que el resto
 * de la suite de billing); sube un comprobante real a S3 porque el
 * servicio no admite mocks (spec: "no reimplementar UploadService").
 *
 * Trato congelado fijo usado en todos los fixtures de este archivo:
 * unitAmount=100, employees=100, discount=0%, taxRate=0.16
 *   → gross=10,000.00, subtotal=10,000.00, tax=1,600.00, total=11,600.00
 *   → montoDelPeriodo = 1,160,000 centavos
 */
const UNIT_AMOUNT = 100
const EMPLOYEES = 100
const DISCOUNT_PERCENT = 0
const TAX_RATE = 0.16
const CONTRACTED_TOTAL = 11_600 // = 100 * 100 * 1.16
const PERIOD_AMOUNT_CENTS = 1_160_000

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Governed Payment Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1785962095095',
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
  businessUnit.businessUnitName = `Governed Payment BU ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `governed-payment-bu-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = `Governed Payment Legal ${suffix} ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

interface SubscriptionFixture {
  businessUnitId: number
  billingPlanId: number
  status: BillingSubscriptionStatus
  contractedTotal?: number | null
  creditBalanceCents?: number
  currentPeriodEnd?: DateTime | null
}

async function createSubscription(fixture: SubscriptionFixture): Promise<BillingSubscription> {
  const now = DateTime.now()
  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', fixture.billingPlanId)
    .firstOrFail()

  const contractedTotal = fixture.contractedTotal === undefined ? CONTRACTED_TOTAL : fixture.contractedTotal

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
    billingSubscriptionContractedTotal: contractedTotal as number,
    billingSubscriptionCreditBalanceCents: fixture.creditBalanceCents ?? 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd:
      fixture.currentPeriodEnd === undefined ? now : fixture.currentPeriodEnd,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId:
      fixture.status === 'canceled' ? null : fixture.businessUnitId,
  })
}

async function makeReceipt(): Promise<{ tmpPath: string; cleanup: () => Promise<void> }> {
  const tmpPath = path.join(os.tmpdir(), `governed-payment-receipt-${Date.now()}-${Math.random()}.pdf`)
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
      await BillingPayment.query()
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

test.group('BillingPaymentService.registerPayment — pagos gobernados (USRH1785962095095)', () => {
  test('Criterio 1 — flujo normal gobernado extiende 1 periodo (reglas 1, 5)', async ({ assert }) => {
    const stamp = Date.now() + 300
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'normal')
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
        { method: 'transfer', reference: 'SPEI-0099123', paidAt: DateTime.now().toISO()! },
        { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
      )

      assert.equal(result.amountCents, PERIOD_AMOUNT_CENTS)
      assert.equal(result.periodsCovered, 1)
      assert.equal(result.creditAppliedCents, PERIOD_AMOUNT_CENTS)
      assert.equal(result.creditBalanceAfterCents, 0)
      assert.isFalse(result.isCustomAmount)
      assert.equal(result.subscription.status, 'active')
      assert.equal(result.subscription.creditBalanceCents, 0)
      assert.isNotNull(result.periodStart)
      assert.isNotNull(result.periodEnd)

      const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(reloaded.billingSubscriptionLiveBusinessUnitId, bu.businessUnitId)
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 2 — importe ajeno en flujo normal se rechaza sin asentar nada (regla 1)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 301
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'not-allowed')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      let error: BillingPaymentServiceError | null = null
      try {
        await service.registerPayment(
          subscription.billingSubscriptionId,
          {
            amountCents: PERIOD_AMOUNT_CENTS + 1,
            method: 'transfer',
            paidAt: DateTime.now().toISO()!,
          },
          { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
        )
      } catch (e) {
        error = e as BillingPaymentServiceError
      }

      assert.equal(error?.errorCode, 'PLT.PAY.AMOUNT_NOT_ALLOWED')
      assert.equal(error?.httpStatus, 422)
      assert.equal(error?.key, 'monto-no-permitido')

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 0)

      const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(reloaded.billingSubscriptionCreditBalanceCents, 0)
      assert.equal(reloaded.billingSubscriptionStatus, 'past_due')
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 3 — importe distinto parcial acumula saldo y no mueve nada (reglas 4, 6)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 302
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'partial')
    const periodEnd = DateTime.now()
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
      currentPeriodEnd: periodEnd,
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      const result = await service.registerPayment(
        subscription.billingSubscriptionId,
        { amountCents: 400_000, allowCustomAmount: true, method: 'cash', paidAt: DateTime.now().toISO()! },
        { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
      )

      assert.equal(result.periodsCovered, 0)
      assert.equal(result.creditAppliedCents, 0)
      assert.equal(result.creditBalanceAfterCents, 400_000)
      assert.isNull(result.periodStart)
      assert.isNull(result.periodEnd)
      assert.isTrue(result.isCustomAmount)
      assert.equal(result.subscription.status, 'past_due')
      assert.equal(result.subscription.creditBalanceCents, 400_000)

      const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(
        reloaded.billingSubscriptionCurrentPeriodEnd!.toISODate(),
        periodEnd.toISODate()
      )
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 4 — el acumulado completa el periodo (regla 5)', async ({ assert }) => {
    const stamp = Date.now() + 303
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'complete')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
      creditBalanceCents: 400_000,
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      const result = await service.registerPayment(
        subscription.billingSubscriptionId,
        { amountCents: 760_000, allowCustomAmount: true, method: 'cash', paidAt: DateTime.now().toISO()! },
        { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
      )

      assert.equal(result.periodsCovered, 1)
      assert.equal(result.creditAppliedCents, PERIOD_AMOUNT_CENTS)
      assert.equal(result.creditBalanceAfterCents, 0)
      assert.equal(result.subscription.status, 'active')
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 5 — pago mayor cubre N periodos y deja sobrante con foto financiera (reglas 5, 12)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 304
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'multi')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'active',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      const result = await service.registerPayment(
        subscription.billingSubscriptionId,
        { amountCents: 3_500_000, allowCustomAmount: true, method: 'transfer', paidAt: DateTime.now().toISO()! },
        { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
      )

      assert.equal(result.periodsCovered, 3)
      assert.equal(result.creditAppliedCents, 3 * PERIOD_AMOUNT_CENTS)
      assert.equal(result.creditBalanceAfterCents, 3_500_000 - 3 * PERIOD_AMOUNT_CENTS)

      const payment = await BillingPayment.findOrFail(result.billingPaymentId)
      assert.equal(payment.billingPaymentGrossCents, 1_000_000)
      assert.equal(payment.billingPaymentDiscountAmountCents, 0)
      assert.equal(payment.billingPaymentSubtotalCents, 1_000_000)
      assert.equal(payment.billingPaymentTaxAmountCents, 160_000)
      assert.equal(payment.billingPaymentTotalCents, PERIOD_AMOUNT_CENTS)
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 6 — tope de periodos por pago rechaza sin asentar nada (regla 7)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 305
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'cap')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'active',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      let error: BillingPaymentServiceError | null = null
      try {
        await service.registerPayment(
          subscription.billingSubscriptionId,
          { amountCents: 30_000_000, allowCustomAmount: true, method: 'transfer', paidAt: DateTime.now().toISO()! },
          { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
        )
      } catch (e) {
        error = e as BillingPaymentServiceError
      }

      assert.equal(error?.errorCode, 'PLT.PAY.PERIODS_OUT_OF_RANGE')
      assert.equal(error?.key, 'periodos-fuera-de-rango')

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 0)

      const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(reloaded.billingSubscriptionCreditBalanceCents, 0)
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('Criterio 7 — suscripción cancelada rechaza cualquier pago (regla 9)', async ({ assert }) => {
    const stamp = Date.now() + 306
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'canceled')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'canceled',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      let error: BillingPaymentServiceError | null = null
      try {
        await service.registerPayment(
          subscription.billingSubscriptionId,
          { method: 'transfer', paidAt: DateTime.now().toISO()! },
          { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
        )
      } catch (e) {
        error = e as BillingPaymentServiceError
      }

      assert.equal(error?.errorCode, 'PLT.PAY.SUBSCRIPTION_CANCELED')
      assert.equal(error?.key, 'suscripcion-cancelada')

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

  test('Criterio 9 — monto del periodo indeterminable rechaza sin subir comprobante (regla 2)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 307
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'unavailable')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
      contractedTotal: 0,
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      let error: BillingPaymentServiceError | null = null
      try {
        await service.registerPayment(
          subscription.billingSubscriptionId,
          { method: 'transfer', paidAt: DateTime.now().toISO()! },
          { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
        )
      } catch (e) {
        error = e as BillingPaymentServiceError
      }

      assert.equal(error?.errorCode, 'PLT.PAY.PERIOD_AMOUNT_UNAVAILABLE')
      assert.equal(error?.key, 'monto-periodo-no-disponible')
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('allowCustomAmount=true sin amountCents rechaza con AMOUNT_REQUIRED', async ({ assert }) => {
    const stamp = Date.now() + 308
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'required')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      let error: BillingPaymentServiceError | null = null
      try {
        await service.registerPayment(
          subscription.billingSubscriptionId,
          { allowCustomAmount: true, method: 'transfer', paidAt: DateTime.now().toISO()! },
          { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
        )
      } catch (e) {
        error = e as BillingPaymentServiceError
      }

      assert.equal(error?.errorCode, 'PLT.PAY.AMOUNT_REQUIRED')
      assert.equal(error?.key, 'monto-requerido')
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('importe distinto fuera de cotas rechaza con AMOUNT_INVALID (conservado)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 309
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'invalid')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      let error: BillingPaymentServiceError | null = null
      try {
        await service.registerPayment(
          subscription.billingSubscriptionId,
          { amountCents: 50, allowCustomAmount: true, method: 'transfer', paidAt: DateTime.now().toISO()! },
          { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
        )
      } catch (e) {
        error = e as BillingPaymentServiceError
      }

      assert.equal(error?.errorCode, 'PLT.PAY.AMOUNT_INVALID')
      assert.equal(error?.key, 'monto-invalido')
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('listPayments tolera periodStart/periodEnd nulos de un pago parcial', async ({ assert }) => {
    const stamp = Date.now() + 310
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'list-null')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'past_due',
    })
    const receipt = await makeReceipt()

    const service = new BillingPaymentService()
    try {
      await service.registerPayment(
        subscription.billingSubscriptionId,
        { amountCents: 400_000, allowCustomAmount: true, method: 'cash', paidAt: DateTime.now().toISO()! },
        { tmpPath: receipt.tmpPath, clientName: 'comprobante.pdf', size: 20, headers: { 'content-type': 'application/pdf' } }
      )

      const list = await service.listPayments(subscription.billingSubscriptionId)
      assert.equal(list.data.length, 1)
      assert.isNull(list.data[0].periodStart)
      assert.isNull(list.data[0].periodEnd)
    } finally {
      await receipt.cleanup()
      await cleanup([bu.businessUnitId], [planId])
    }
  })
})

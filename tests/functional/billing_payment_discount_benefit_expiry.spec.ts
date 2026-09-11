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
import type { DiscountCodeKind } from '#models/discount_code'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingPaymentService from '#services/billing_payment_service'
import UploadService from '#services/upload_service'
import { BillingPaymentServiceError } from '../../app/exceptions/billing_payment_service_error.js'

/**
 * USRH1787714804404 — Agotar la duración del beneficio y restaurar el precio.
 *
 * Escenario base del spec (§5, Anexo A): plan 79.00/empleado, 120 empleados,
 * volumen 10%, código FJGHA897 (percent 15%, benefitPeriods=3). Periodo con
 * descuento = 841,255 centavos; sin descuento = 989,712 centavos.
 */
const LIST_UNIT_AMOUNT = 79
const EMPLOYEES = 120
const VOLUME_DISCOUNT_PERCENT = 10
const TAX_RATE = 0.16
const UNDISCOUNTED_UNIT_AMOUNT = 79
const UNDISCOUNTED_SUBTOTAL = 8_532.0
const UNDISCOUNTED_TAX_AMOUNT = 1_365.12
const UNDISCOUNTED_TOTAL = 9_897.12
const UNDISCOUNTED_TOTAL_CENTS = 989_712

// Código percent 15%, benefitPeriods = 3 (escenario base del spec).
const PERCENT_CODE_DISCOUNT_AMOUNT = 1_279.8
const PERCENT_CONTRACTED_SUBTOTAL = 7_252.2
const PERCENT_CONTRACTED_TAX_AMOUNT = 1_160.35
const PERCENT_CONTRACTED_TOTAL = 8_412.55
const PERCENT_CONTRACTED_TOTAL_CENTS = 841_255

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Benefit Expiry Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1787714804404',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: LIST_UNIT_AMOUNT,
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
    billingVolumeTierDiscountPercent: VOLUME_DISCOUNT_PERCENT,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: number, suffix: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Benefit Expiry BU ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `benefit-expiry-bu-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = `Benefit Expiry Legal ${suffix} ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

interface DiscountCodeFixture {
  text: string
  kind: DiscountCodeKind
  value: number
  benefitPeriods: number | null
  benefitPeriodsUsed: number
  codeDiscountAmount: number
  contractedUnitAmount: number
  contractedSubtotal: number
  contractedTaxAmount: number
  contractedTotal: number
}

interface SubscriptionFixture {
  businessUnitId: number
  billingPlanId: number
  status: BillingSubscriptionStatus
  discountCode: DiscountCodeFixture
}

async function createSubscriptionWithCode(
  fixture: SubscriptionFixture
): Promise<BillingSubscription> {
  const now = DateTime.now()
  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', fixture.billingPlanId)
    .firstOrFail()
  const dc = fixture.discountCode

  return BillingSubscription.create({
    businessUnitId: fixture.businessUnitId,
    billingPlanId: fixture.billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: fixture.status,
    billingSubscriptionContractedUnitAmount: dc.contractedUnitAmount,
    billingSubscriptionContractedEmployees: EMPLOYEES,
    billingSubscriptionDiscountPercent: VOLUME_DISCOUNT_PERCENT,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: TAX_RATE,
    billingSubscriptionContractedSubtotal: dc.contractedSubtotal,
    billingSubscriptionContractedTaxAmount: dc.contractedTaxAmount,
    billingSubscriptionContractedTotal: dc.contractedTotal,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd: now,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: fixture.businessUnitId,
    billingSubscriptionDiscountCodeText: dc.text,
    billingSubscriptionDiscountCodeKind: dc.kind,
    billingSubscriptionDiscountCodeValue: dc.value,
    billingSubscriptionDiscountCodeBenefitPeriods: dc.benefitPeriods,
    billingSubscriptionDiscountCodeBenefitPeriodsUsed: dc.benefitPeriodsUsed,
    billingSubscriptionCodeDiscountAmount: dc.codeDiscountAmount,
    billingSubscriptionUndiscountedUnitAmount: UNDISCOUNTED_UNIT_AMOUNT,
    billingSubscriptionUndiscountedSubtotal: UNDISCOUNTED_SUBTOTAL,
    billingSubscriptionUndiscountedTaxAmount: UNDISCOUNTED_TAX_AMOUNT,
    billingSubscriptionUndiscountedTotal: UNDISCOUNTED_TOTAL,
  })
}

async function makeReceipt(): Promise<{ tmpPath: string; cleanup: () => Promise<void> }> {
  const tmpPath = path.join(
    os.tmpdir(),
    `benefit-expiry-receipt-${Date.now()}-${Math.random()}.pdf`
  )
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

async function registerPayment(
  subscriptionId: number,
  reference: string,
  opts: { amountCents?: number; allowCustomAmount?: boolean } = {}
) {
  const receipt = await makeReceipt()
  const service = new BillingPaymentService()
  try {
    return await service.registerPayment(
      subscriptionId,
      {
        method: 'transfer',
        reference,
        paidAt: DateTime.now().toISO()!,
        amountCents: opts.amountCents,
        allowCustomAmount: opts.allowCustomAmount ?? false,
      },
      {
        tmpPath: receipt.tmpPath,
        clientName: 'comprobante.pdf',
        size: 20,
        headers: { 'content-type': 'application/pdf' },
      }
    )
  } finally {
    await receipt.cleanup()
  }
}

test.group(
  'BillingPaymentService.registerPayment — agotar el beneficio y restaurar el precio (USRH1787714804404)',
  (group) => {
    let originalUploadPrivateBuffer: UploadService['uploadPrivateBuffer']
    let originalDeleteFile: UploadService['deleteFile']

    group.setup(() => {
      originalUploadPrivateBuffer = UploadService.prototype.uploadPrivateBuffer
      originalDeleteFile = UploadService.prototype.deleteFile
      UploadService.prototype.uploadPrivateBuffer = async (key) => `test-private/${key}`
      UploadService.prototype.deleteFile = async () =>
        ({
          status: 200,
          data: {},
          message: 'file_deleted_successfully',
        }) as Awaited<ReturnType<UploadService['deleteFile']>>
    })

    group.teardown(() => {
      UploadService.prototype.uploadPrivateBuffer = originalUploadPrivateBuffer
      UploadService.prototype.deleteFile = originalDeleteFile
    })

    test('CA-1..CA-3 — secuencia de 4 cobros: consumo, agotamiento, restauración y cobro sin código', async ({
      assert,
    }) => {
      const stamp = Date.now() + 3000
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'sequence')
      const subscription = await createSubscriptionWithCode({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'trialing',
        discountCode: {
          text: 'FJGHA897',
          kind: 'percent',
          value: 15,
          benefitPeriods: 3,
          benefitPeriodsUsed: 0,
          codeDiscountAmount: PERCENT_CODE_DISCOUNT_AMOUNT,
          contractedUnitAmount: LIST_UNIT_AMOUNT,
          contractedSubtotal: PERCENT_CONTRACTED_SUBTOTAL,
          contractedTaxAmount: PERCENT_CONTRACTED_TAX_AMOUNT,
          contractedTotal: PERCENT_CONTRACTED_TOTAL,
        },
      })

      try {
        const service = new BillingPaymentService()

        // ── Pago 1: consume 1/3, sin restauración ──────────────────────
        const p1 = await registerPayment(
          subscription.billingSubscriptionId,
          'SEQ-1',
          { amountCents: PERCENT_CONTRACTED_TOTAL_CENTS }
        )
        assert.equal(p1.amountCents, PERCENT_CONTRACTED_TOTAL_CENTS)
        assert.equal(p1.periodsCovered, 1)
        let reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 1)
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), PERCENT_CONTRACTED_TOTAL)
        const d1 = await service.getPaymentDetail(
          subscription.billingSubscriptionId,
          p1.billingPaymentId
        )
        assert.equal(d1.breakdown!.discountCodeBenefitPeriodsUsedAfter, 1)
        assert.equal(d1.breakdown!.codeDiscountAmountCents, 127_980)

        // ── Pago 2: consume 2/3, sin restauración ──────────────────────
        const p2 = await registerPayment(
          subscription.billingSubscriptionId,
          'SEQ-2',
          { amountCents: PERCENT_CONTRACTED_TOTAL_CENTS }
        )
        assert.equal(p2.periodsCovered, 1)
        reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 2)
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), PERCENT_CONTRACTED_TOTAL)

        // ── Pago 3: agota el beneficio y restaura, en la misma operación ─
        const p3 = await registerPayment(
          subscription.billingSubscriptionId,
          'SEQ-3',
          { amountCents: PERCENT_CONTRACTED_TOTAL_CENTS }
        )
        assert.equal(p3.amountCents, PERCENT_CONTRACTED_TOTAL_CENTS)
        const d3 = await service.getPaymentDetail(
          subscription.billingSubscriptionId,
          p3.billingPaymentId
        )
        // Regla 4/12: el pago que agota se cobra CON descuento; la foto lo prueba.
        assert.equal(d3.breakdown!.codeDiscountAmountCents, 127_980)
        assert.equal(d3.breakdown!.discountCodeBenefitPeriodsUsedAfter, 3)
        assert.equal(d3.breakdown!.totalCents, PERCENT_CONTRACTED_TOTAL_CENTS)

        reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 3)
        assert.equal(Number(reloaded.billingSubscriptionContractedSubtotal), UNDISCOUNTED_SUBTOTAL)
        assert.equal(
          Number(reloaded.billingSubscriptionContractedTaxAmount),
          UNDISCOUNTED_TAX_AMOUNT
        )
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), UNDISCOUNTED_TOTAL)
        assert.equal(
          Number(reloaded.billingSubscriptionContractedUnitAmount),
          UNDISCOUNTED_UNIT_AMOUNT
        )
        assert.equal(Number(reloaded.billingSubscriptionCodeDiscountAmount), 0)
        // Regla 5: el descuento por volumen queda intacto.
        assert.equal(Number(reloaded.billingSubscriptionDiscountPercent), VOLUME_DISCOUNT_PERCENT)
        // Regla 8: las condiciones congeladas del código no se borran.
        assert.equal(reloaded.billingSubscriptionDiscountCodeText, 'FJGHA897')
        assert.equal(reloaded.billingSubscriptionDiscountCodeKind, 'percent')
        assert.equal(Number(reloaded.billingSubscriptionDiscountCodeValue), 15)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriods, 3)

        // ── Pago 4: el importe con descuento ya no se acepta ────────────
        let thrown: unknown = null
        try {
          await registerPayment(subscription.billingSubscriptionId, 'SEQ-4-REJECTED', {
            amountCents: PERCENT_CONTRACTED_TOTAL_CENTS,
          })
        } catch (error) {
          thrown = error
        }
        assert.instanceOf(thrown, BillingPaymentServiceError)
        assert.equal(
          (thrown as BillingPaymentServiceError).errorCode,
          'PLT.PAY.AMOUNT_NOT_ALLOWED'
        )
        assert.equal((thrown as BillingPaymentServiceError).key, 'monto-no-permitido')

        // El cuarto pago sale ya por el precio sin código.
        const p4 = await registerPayment(subscription.billingSubscriptionId, 'SEQ-4', {
          amountCents: UNDISCOUNTED_TOTAL_CENTS,
        })
        assert.equal(p4.amountCents, UNDISCOUNTED_TOTAL_CENTS)
        const d4 = await service.getPaymentDetail(
          subscription.billingSubscriptionId,
          p4.billingPaymentId
        )
        assert.equal(d4.breakdown!.discountCodeText, null)
        assert.equal(d4.breakdown!.discountCodeKind, null)
        assert.equal(d4.breakdown!.codeDiscountAmountCents, 0)
        assert.equal(d4.breakdown!.discountCodeBenefitPeriodsUsedAfter, null)
        reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 3)
      } finally {
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('CA-4 — unit_price: al restaurar, el precio por empleado vuelve al de lista', async ({
      assert,
    }) => {
      const stamp = Date.now() + 3001
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'unit-price')
      const subscription = await createSubscriptionWithCode({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'trialing',
        discountCode: {
          text: 'PRECIOFIJO65',
          kind: 'unit_price',
          value: 65,
          benefitPeriods: 3,
          benefitPeriodsUsed: 2, // le queda exactamente 1: este pago lo agota
          codeDiscountAmount: 1_512.0,
          contractedUnitAmount: 65,
          contractedSubtotal: 7_020.0,
          contractedTaxAmount: 1_123.2,
          contractedTotal: 8_143.2,
        },
      })

      try {
        const service = new BillingPaymentService()
        const registered = await registerPayment(subscription.billingSubscriptionId, 'UNITP-1', {
          amountCents: 814_320,
        })
        const detail = await service.getPaymentDetail(
          subscription.billingSubscriptionId,
          registered.billingPaymentId
        )
        assert.equal(detail.breakdown!.codeDiscountAmountCents, 151_200)
        assert.equal(detail.breakdown!.discountCodeBenefitPeriodsUsedAfter, 3)

        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(
          Number(reloaded.billingSubscriptionContractedUnitAmount),
          UNDISCOUNTED_UNIT_AMOUNT
        )
        assert.equal(Number(reloaded.billingSubscriptionContractedSubtotal), UNDISCOUNTED_SUBTOTAL)
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), UNDISCOUNTED_TOTAL)
        assert.equal(Number(reloaded.billingSubscriptionCodeDiscountAmount), 0)
      } finally {
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('CA-5 — duración indefinida: el contador sube pero el precio nunca se restaura', async ({
      assert,
    }) => {
      const stamp = Date.now() + 3002
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'indefinite')
      const subscription = await createSubscriptionWithCode({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'trialing',
        discountCode: {
          text: 'INDEFINIDO',
          kind: 'percent',
          value: 15,
          benefitPeriods: null,
          benefitPeriodsUsed: 7,
          codeDiscountAmount: PERCENT_CODE_DISCOUNT_AMOUNT,
          contractedUnitAmount: LIST_UNIT_AMOUNT,
          contractedSubtotal: PERCENT_CONTRACTED_SUBTOTAL,
          contractedTaxAmount: PERCENT_CONTRACTED_TAX_AMOUNT,
          contractedTotal: PERCENT_CONTRACTED_TOTAL,
        },
      })

      try {
        const service = new BillingPaymentService()
        const registered = await registerPayment(subscription.billingSubscriptionId, 'INDEF-1', {
          amountCents: PERCENT_CONTRACTED_TOTAL_CENTS,
        })
        const detail = await service.getPaymentDetail(
          subscription.billingSubscriptionId,
          registered.billingPaymentId
        )
        assert.equal(detail.breakdown!.codeDiscountAmountCents, 127_980)
        assert.equal(detail.breakdown!.discountCodeBenefitPeriodsUsedAfter, 8)

        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 8)
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), PERCENT_CONTRACTED_TOTAL)
        assert.equal(
          Number(reloaded.billingSubscriptionCodeDiscountAmount),
          PERCENT_CODE_DISCOUNT_AMOUNT
        )
      } finally {
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('CA-6 — pago parcial no avanza el periodo ni consume beneficio', async ({ assert }) => {
      const stamp = Date.now() + 3003
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'partial')
      const subscription = await createSubscriptionWithCode({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'trialing',
        discountCode: {
          text: 'FJGHA897',
          kind: 'percent',
          value: 15,
          benefitPeriods: 3,
          benefitPeriodsUsed: 0,
          codeDiscountAmount: PERCENT_CODE_DISCOUNT_AMOUNT,
          contractedUnitAmount: LIST_UNIT_AMOUNT,
          contractedSubtotal: PERCENT_CONTRACTED_SUBTOTAL,
          contractedTaxAmount: PERCENT_CONTRACTED_TAX_AMOUNT,
          contractedTotal: PERCENT_CONTRACTED_TOTAL,
        },
      })

      try {
        const registered = await registerPayment(subscription.billingSubscriptionId, 'PARTIAL-1', {
          amountCents: 500_000,
          allowCustomAmount: true,
        })
        assert.equal(registered.periodsCovered, 0)
        assert.equal(registered.creditBalanceAfterCents, 500_000)

        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 0)
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), PERCENT_CONTRACTED_TOTAL)
      } finally {
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('CA-7 — un pago multiperiodo dentro del beneficio consume esa misma cantidad', async ({
      assert,
    }) => {
      const stamp = Date.now() + 3004
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'multi-within')
      const subscription = await createSubscriptionWithCode({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'trialing',
        discountCode: {
          text: 'FJGHA897',
          kind: 'percent',
          value: 15,
          benefitPeriods: 3,
          benefitPeriodsUsed: 0,
          codeDiscountAmount: PERCENT_CODE_DISCOUNT_AMOUNT,
          contractedUnitAmount: LIST_UNIT_AMOUNT,
          contractedSubtotal: PERCENT_CONTRACTED_SUBTOTAL,
          contractedTaxAmount: PERCENT_CONTRACTED_TAX_AMOUNT,
          contractedTotal: PERCENT_CONTRACTED_TOTAL,
        },
      })

      try {
        const service = new BillingPaymentService()
        const registered = await registerPayment(subscription.billingSubscriptionId, 'MULTI-1', {
          amountCents: PERCENT_CONTRACTED_TOTAL_CENTS * 2,
          allowCustomAmount: true,
        })
        assert.equal(registered.periodsCovered, 2)

        const detail = await service.getPaymentDetail(
          subscription.billingSubscriptionId,
          registered.billingPaymentId
        )
        assert.equal(detail.breakdown!.discountCodeBenefitPeriodsUsedAfter, 2)

        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 2)
        // 2 < 3: sin restauración todavía.
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), PERCENT_CONTRACTED_TOTAL)
      } finally {
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('ERROR — un pago que excedería los periodos restantes del beneficio se rechaza', async ({
      assert,
    }) => {
      const stamp = Date.now() + 3005
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'exceeds')
      const subscription = await createSubscriptionWithCode({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'trialing',
        discountCode: {
          text: 'FJGHA897',
          kind: 'percent',
          value: 15,
          benefitPeriods: 3,
          benefitPeriodsUsed: 2, // solo resta 1 periodo con descuento
          codeDiscountAmount: PERCENT_CODE_DISCOUNT_AMOUNT,
          contractedUnitAmount: LIST_UNIT_AMOUNT,
          contractedSubtotal: PERCENT_CONTRACTED_SUBTOTAL,
          contractedTaxAmount: PERCENT_CONTRACTED_TAX_AMOUNT,
          contractedTotal: PERCENT_CONTRACTED_TOTAL,
        },
      })

      try {
        let thrown: unknown = null
        try {
          await registerPayment(subscription.billingSubscriptionId, 'EXCEEDS-1', {
            amountCents: PERCENT_CONTRACTED_TOTAL_CENTS * 2, // cubriría 2, solo restan 1
            allowCustomAmount: true,
          })
        } catch (error) {
          thrown = error
        }

        assert.instanceOf(thrown, BillingPaymentServiceError)
        assert.equal(
          (thrown as BillingPaymentServiceError).errorCode,
          'PLT.PAY.DISCOUNT_PERIODS_EXCEEDED'
        )
        assert.equal((thrown as BillingPaymentServiceError).httpStatus, 422)
        assert.equal((thrown as BillingPaymentServiceError).key, 'periodos-exceden-descuento')
        assert.include(
          (thrown as BillingPaymentServiceError).detail ?? '',
          'cubriría 2 periodos'
        )

        // Fail-closed: nada se movió.
        const payments = await BillingPayment.query().where(
          'billing_subscription_id',
          subscription.billingSubscriptionId
        )
        assert.lengthOf(payments, 0)

        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 2)
        assert.equal(reloaded.billingSubscriptionCreditBalanceCents, 0)
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), PERCENT_CONTRACTED_TOTAL)
      } finally {
        await cleanup([bu.businessUnitId], [planId])
      }
    })

    test('CA-8 — una suscripción cancelada a media duración no admite más pagos ni se altera', async ({
      assert,
    }) => {
      const stamp = Date.now() + 3006
      const planId = await createPublishedPlan(stamp)
      const bu = await createBusinessUnit(stamp, 'canceled')
      const subscription = await createSubscriptionWithCode({
        businessUnitId: bu.businessUnitId,
        billingPlanId: planId,
        status: 'canceled',
        discountCode: {
          text: 'FJGHA897',
          kind: 'percent',
          value: 15,
          benefitPeriods: 3,
          benefitPeriodsUsed: 1,
          codeDiscountAmount: PERCENT_CODE_DISCOUNT_AMOUNT,
          contractedUnitAmount: LIST_UNIT_AMOUNT,
          contractedSubtotal: PERCENT_CONTRACTED_SUBTOTAL,
          contractedTaxAmount: PERCENT_CONTRACTED_TAX_AMOUNT,
          contractedTotal: PERCENT_CONTRACTED_TOTAL,
        },
      })

      try {
        let thrown: unknown = null
        try {
          await registerPayment(subscription.billingSubscriptionId, 'CANCELED-1', {
            amountCents: PERCENT_CONTRACTED_TOTAL_CENTS,
          })
        } catch (error) {
          thrown = error
        }

        assert.instanceOf(thrown, BillingPaymentServiceError)
        assert.equal(
          (thrown as BillingPaymentServiceError).errorCode,
          'PLT.PAY.SUBSCRIPTION_CANCELED'
        )
        assert.equal((thrown as BillingPaymentServiceError).key, 'suscripcion-cancelada')

        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 1)
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), PERCENT_CONTRACTED_TOTAL)
        assert.equal(
          Number(reloaded.billingSubscriptionCodeDiscountAmount),
          PERCENT_CODE_DISCOUNT_AMOUNT
        )
      } finally {
        await cleanup([bu.businessUnitId], [planId])
      }
    })
  }
)

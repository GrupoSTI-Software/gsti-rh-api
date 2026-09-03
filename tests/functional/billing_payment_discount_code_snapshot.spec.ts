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
 * USRH1787714804403 — Cobrar el periodo con el descuento congelado.
 *
 * Verifica que `computeFinancialSnapshot` TRANSCRIBE el trato ya congelado
 * por la contratación (eslabón 5/6), sin recalcular precios ni consultar
 * `billing_plan_prices`, y que las tres formas de código (percent,
 * fixed_amount, unit_price) dejan un desglose que cuadra:
 *   gross − volumen − código = subtotal   y   total = importe exigido.
 *
 * Fixture común: plan con precio de lista 79.00/empleado, 120 empleados,
 * descuento por volumen 10%. Cifras verificadas a mano (regla 5, Anexo A):
 *   gross = 9,480.00 · undiscountedSubtotal = 8,532.00 (gross − 948.00 de volumen)
 */
const LIST_UNIT_AMOUNT = 79
const EMPLOYEES = 120
const VOLUME_DISCOUNT_PERCENT = 10
const TAX_RATE = 0.16
const UNDISCOUNTED_SUBTOTAL = 8_532.0
const UNDISCOUNTED_TAX_AMOUNT = 1_365.12
const UNDISCOUNTED_TOTAL = 9_897.12

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Discount Snapshot Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1787714804403',
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
  businessUnit.businessUnitName = `Discount Snapshot BU ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `discount-snapshot-bu-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = `Discount Snapshot Legal ${suffix} ${stamp}`
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
  contractedSubtotal: number
  contractedTaxAmount: number
  contractedTotal: number
  /** Sobreescribe `undiscounted_subtotal` para simular un congelado corrupto. */
  undiscountedSubtotalOverride?: number
  /** Fuerza un `kind` inválido en la fila cruda (bypass de tipos, regla 7). */
  rawKindOverride?: string | null
}

interface SubscriptionFixture {
  businessUnitId: number
  billingPlanId: number
  status: BillingSubscriptionStatus
  discountCode?: DiscountCodeFixture | null
}

async function createSubscription(fixture: SubscriptionFixture): Promise<BillingSubscription> {
  const now = DateTime.now()
  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', fixture.billingPlanId)
    .firstOrFail()

  const dc = fixture.discountCode ?? null

  const subscription = await BillingSubscription.create({
    businessUnitId: fixture.businessUnitId,
    billingPlanId: fixture.billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: fixture.status,
    billingSubscriptionContractedUnitAmount: LIST_UNIT_AMOUNT,
    billingSubscriptionContractedEmployees: EMPLOYEES,
    billingSubscriptionDiscountPercent: VOLUME_DISCOUNT_PERCENT,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: TAX_RATE,
    billingSubscriptionContractedSubtotal: dc ? dc.contractedSubtotal : UNDISCOUNTED_SUBTOTAL,
    billingSubscriptionContractedTaxAmount: dc ? dc.contractedTaxAmount : UNDISCOUNTED_TAX_AMOUNT,
    billingSubscriptionContractedTotal: dc ? dc.contractedTotal : UNDISCOUNTED_TOTAL,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now,
    billingSubscriptionCurrentPeriodEnd: now,
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: fixture.businessUnitId,
    billingSubscriptionDiscountCodeText: dc?.text ?? null,
    billingSubscriptionDiscountCodeKind: dc ? (dc.kind as DiscountCodeKind) : null,
    billingSubscriptionDiscountCodeValue: dc?.value ?? null,
    billingSubscriptionDiscountCodeBenefitPeriods: dc?.benefitPeriods ?? null,
    billingSubscriptionDiscountCodeBenefitPeriodsUsed: dc?.benefitPeriodsUsed ?? 0,
    billingSubscriptionCodeDiscountAmount: dc?.codeDiscountAmount ?? 0,
    billingSubscriptionUndiscountedUnitAmount: dc ? LIST_UNIT_AMOUNT : null,
    billingSubscriptionUndiscountedSubtotal: dc
      ? dc.undiscountedSubtotalOverride ?? UNDISCOUNTED_SUBTOTAL
      : null,
    billingSubscriptionUndiscountedTaxAmount: dc ? UNDISCOUNTED_TAX_AMOUNT : null,
    billingSubscriptionUndiscountedTotal: dc ? UNDISCOUNTED_TOTAL : null,
  })

  if (dc?.rawKindOverride !== undefined) {
    await BillingSubscription.query()
      .where('billingSubscriptionId', subscription.billingSubscriptionId)
      .update({ billing_subscription_discount_code_kind: dc.rawKindOverride })
  }

  return subscription
}

async function makeReceipt(): Promise<{ tmpPath: string; cleanup: () => Promise<void> }> {
  const tmpPath = path.join(
    os.tmpdir(),
    `discount-snapshot-receipt-${Date.now()}-${Math.random()}.pdf`
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

async function registerPayment(subscription: BillingSubscription, reference: string) {
  const receipt = await makeReceipt()
  const service = new BillingPaymentService()
  try {
    return await service.registerPayment(
      subscription.billingSubscriptionId,
      { method: 'transfer', reference, paidAt: DateTime.now().toISO()! },
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

test.group('BillingPaymentService.registerPayment — descuento congelado (USRH1787714804403)', (group) => {
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

  test('percent — transcribe el trato congelado sin recalcular', async ({ assert }) => {
    const stamp = Date.now() + 2000
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'percent')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
      discountCode: {
        text: 'BIENVENIDA15',
        kind: 'percent',
        value: 15,
        benefitPeriods: 3,
        benefitPeriodsUsed: 0,
        codeDiscountAmount: 1_279.8,
        contractedSubtotal: 7_252.2,
        contractedTaxAmount: 1_160.35,
        contractedTotal: 8_412.55,
      },
    })

    try {
      const service = new BillingPaymentService()
      const registered = await registerPayment(subscription, 'DISC-PERCENT-1')
      const detail = await service.getPaymentDetail(
        subscription.billingSubscriptionId,
        registered.billingPaymentId
      )

      assert.isTrue(detail.breakdownAvailable)
      const breakdown = detail.breakdown!
      // gross − volumen − código = subtotal (regla 5)
      assert.equal(breakdown.grossCents, 948_000)
      assert.equal(breakdown.discountAmountCents, 94_800) // volumen, por diferencia
      assert.equal(breakdown.codeDiscountAmountCents, 127_980)
      assert.equal(breakdown.subtotalCents, 725_220)
      assert.equal(
        breakdown.grossCents - breakdown.discountAmountCents - breakdown.codeDiscountAmountCents,
        breakdown.subtotalCents
      )
      assert.equal(breakdown.taxAmountCents, 116_035)
      assert.equal(breakdown.totalCents, 841_255)
      assert.equal(breakdown.discountCodeText, 'BIENVENIDA15')
      assert.equal(breakdown.discountCodeKind, 'percent')
      assert.equal(breakdown.discountCodeBenefitPeriodsUsedAfter, 0)
      // El importe cobrado sigue siendo el total congelado.
      assert.equal(registered.amountCents, 841_255)
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('fixed_amount — transcribe el trato congelado sin recalcular', async ({ assert }) => {
    const stamp = Date.now() + 2001
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'fixed-amount')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
      discountCode: {
        text: 'FIJO1200',
        kind: 'fixed_amount',
        value: 1_200,
        benefitPeriods: null,
        benefitPeriodsUsed: 0,
        codeDiscountAmount: 1_200,
        contractedSubtotal: 7_332.0,
        contractedTaxAmount: 1_173.12,
        contractedTotal: 8_505.12,
      },
    })

    try {
      const service = new BillingPaymentService()
      const registered = await registerPayment(subscription, 'DISC-FIXED-1')
      const detail = await service.getPaymentDetail(
        subscription.billingSubscriptionId,
        registered.billingPaymentId
      )

      const breakdown = detail.breakdown!
      assert.equal(breakdown.grossCents, 948_000)
      assert.equal(breakdown.discountAmountCents, 94_800)
      assert.equal(breakdown.codeDiscountAmountCents, 120_000)
      assert.equal(breakdown.subtotalCents, 733_200)
      assert.equal(breakdown.taxAmountCents, 117_312)
      assert.equal(breakdown.totalCents, 850_512)
      assert.equal(breakdown.discountCodeKind, 'fixed_amount')
      // benefitPeriods null (indefinido): sigue vivo, used_after transcribe el 0 actual.
      assert.equal(breakdown.discountCodeBenefitPeriodsUsedAfter, 0)
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('unit_price — transcribe el trato congelado sin recalcular ni consultar el catálogo', async ({
    assert,
  }) => {
    const stamp = Date.now() + 2002
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'unit-price')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
      discountCode: {
        text: 'PRECIOFIJO65',
        kind: 'unit_price',
        value: 65,
        benefitPeriods: 1,
        benefitPeriodsUsed: 0,
        codeDiscountAmount: 1_512.0,
        contractedSubtotal: 7_020.0,
        contractedTaxAmount: 1_123.2,
        contractedTotal: 8_143.2,
      },
    })

    // Simula catálogo cambiado después del canje: no debe influir en el cobro.
    await BillingPlanPrice.query()
      .where('billing_plan_id', planId)
      .update({ billing_plan_price_amount: 999 })

    try {
      const service = new BillingPaymentService()
      const registered = await registerPayment(subscription, 'DISC-UNITPRICE-1')
      const detail = await service.getPaymentDetail(
        subscription.billingSubscriptionId,
        registered.billingPaymentId
      )

      const breakdown = detail.breakdown!
      // El precio de lista del desglose sigue siendo 79, no el catálogo mutado ni el sustituido.
      assert.equal(breakdown.grossCents, 948_000)
      assert.equal(breakdown.discountAmountCents, 94_800)
      assert.equal(breakdown.codeDiscountAmountCents, 151_200)
      assert.equal(breakdown.subtotalCents, 702_000)
      assert.equal(breakdown.taxAmountCents, 112_320)
      assert.equal(breakdown.totalCents, 814_320)
      assert.equal(breakdown.discountCodeKind, 'unit_price')
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('beneficio agotado — cobra como si no hubiera código (columnas en NULL/0)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 2003
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'exhausted')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
      discountCode: {
        text: 'AGOTADO',
        kind: 'percent',
        value: 15,
        benefitPeriods: 2,
        benefitPeriodsUsed: 2, // ya consumió los 2 periodos de beneficio
        codeDiscountAmount: 1_279.8,
        contractedSubtotal: 7_252.2,
        contractedTaxAmount: 1_160.35,
        contractedTotal: 8_412.55,
      },
    })

    // Con el beneficio agotado, el trato congelado vigente para el cobro es
    // el de lista (sin código): se reescribe contracted_* como lo haría el
    // eslabón 8 al vencer el beneficio (fuera de alcance de esta HU, se
    // fija aquí solo para aislar la variable bajo prueba).
    subscription.billingSubscriptionContractedSubtotal = UNDISCOUNTED_SUBTOTAL
    subscription.billingSubscriptionContractedTaxAmount = UNDISCOUNTED_TAX_AMOUNT
    subscription.billingSubscriptionContractedTotal = UNDISCOUNTED_TOTAL
    subscription.billingSubscriptionContractedUnitAmount = LIST_UNIT_AMOUNT
    await subscription.save()

    try {
      const service = new BillingPaymentService()
      const registered = await registerPayment(subscription, 'DISC-EXHAUSTED-1')
      const detail = await service.getPaymentDetail(
        subscription.billingSubscriptionId,
        registered.billingPaymentId
      )

      const breakdown = detail.breakdown!
      assert.equal(breakdown.discountCodeText, null)
      assert.equal(breakdown.discountCodeKind, null)
      assert.equal(breakdown.codeDiscountAmountCents, 0)
      assert.equal(breakdown.discountCodeBenefitPeriodsUsedAfter, null)
      assert.equal(breakdown.totalCents, Math.round(UNDISCOUNTED_TOTAL * 100))
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('sin código — comportamiento idéntico al de siempre, sin regresión', async ({ assert }) => {
    const stamp = Date.now() + 2004
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'no-code')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
      discountCode: null,
    })

    try {
      const service = new BillingPaymentService()
      const registered = await registerPayment(subscription, 'NO-CODE-1')
      const detail = await service.getPaymentDetail(
        subscription.billingSubscriptionId,
        registered.billingPaymentId
      )

      const breakdown = detail.breakdown!
      assert.equal(breakdown.grossCents, 948_000)
      assert.equal(breakdown.discountAmountCents, 94_800)
      assert.equal(breakdown.subtotalCents, 853_200)
      assert.equal(breakdown.totalCents, 989_712)
      assert.equal(breakdown.discountCodeText, null)
      assert.equal(breakdown.discountCodeKind, null)
      assert.equal(breakdown.codeDiscountAmountCents, 0)
      assert.equal(breakdown.discountCodeBenefitPeriodsUsedAfter, null)
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('congelado incoherente — kind ausente rechaza el pago entero (fail-closed)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 2005
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'inconsistent-kind')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
      discountCode: {
        text: 'ROTO',
        kind: 'percent',
        value: 15,
        benefitPeriods: null,
        benefitPeriodsUsed: 0,
        codeDiscountAmount: 1_279.8,
        contractedSubtotal: 7_252.2,
        contractedTaxAmount: 1_160.35,
        contractedTotal: 8_412.55,
        rawKindOverride: null, // simula un kind vacío pese a haber texto de código
      },
    })

    try {
      let thrown: unknown = null
      try {
        await registerPayment(subscription, 'DISC-BROKEN-KIND-1')
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, BillingPaymentServiceError)
      assert.equal(
        (thrown as BillingPaymentServiceError).errorCode,
        'PLT.PAY.DISCOUNT_SNAPSHOT_INCONSISTENT'
      )
      assert.equal((thrown as BillingPaymentServiceError).httpStatus, 500)

      // Fail-closed: no debe haber quedado ningún pago persistido.
      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 0)
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })

  test('congelado incoherente — la resta no cuadra rechaza el pago entero', async ({ assert }) => {
    const stamp = Date.now() + 2006
    const planId = await createPublishedPlan(stamp)
    const bu = await createBusinessUnit(stamp, 'inconsistent-math')
    const subscription = await createSubscription({
      businessUnitId: bu.businessUnitId,
      billingPlanId: planId,
      status: 'trialing',
      discountCode: {
        text: 'DESCUADRADO',
        kind: 'percent',
        value: 15,
        benefitPeriods: null,
        benefitPeriodsUsed: 0,
        codeDiscountAmount: 1_279.8,
        contractedSubtotal: 7_252.2,
        contractedTaxAmount: 1_160.35,
        contractedTotal: 8_412.55,
        // undiscounted_subtotal corrupto: no reconcilia con contracted_subtotal + código.
        undiscountedSubtotalOverride: 8_000.0,
      },
    })

    try {
      let thrown: unknown = null
      try {
        await registerPayment(subscription, 'DISC-BROKEN-MATH-1')
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, BillingPaymentServiceError)
      assert.equal(
        (thrown as BillingPaymentServiceError).errorCode,
        'PLT.PAY.DISCOUNT_SNAPSHOT_INCONSISTENT'
      )

      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 0)
    } finally {
      await cleanup([bu.businessUnitId], [planId])
    }
  })
})

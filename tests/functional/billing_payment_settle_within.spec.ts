import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PDFDocument } from 'pdf-lib'
import BillingPlan from '#models/billing_plan'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import BillingPaymentService, {
  type SettlePaymentInput,
} from '#services/billing_payment_service'
import UploadService from '#services/upload_service'
import AllianceCommissionService from '#services/alliance_commission_service'
import { BILLING_PROVIDER_ERROR_CODES } from '#constants/billing_provider_error_codes'
import { BILLING_PAYMENT_ERROR_CODES } from '#constants/billing_payment_error_codes'
import { BillingProviderServiceError } from '#exceptions/billing_provider_service_error'
import { BillingPaymentServiceError } from '#exceptions/billing_payment_service_error'
import {
  BILLING_PROVIDER_KEYS,
  type BillingProviderPort,
  type RecordedPaymentRequest,
  type SubscriptionOpening,
  type SubscriptionOpeningRequest,
} from '#modules/billing-provider/billing_provider.port'
import { billingProviderRegistry } from '#modules/billing-provider/billing_provider.registry'
import { todayInBusinessZone, toBusinessDateString } from '#utils/business_date'

class StripeAdmitProbeAdapter implements BillingProviderPort {
  readonly key = BILLING_PROVIDER_KEYS.STRIPE
  lastAdmitRequest: RecordedPaymentRequest | null = null
  rejectAdmit = false

  async openSubscription(_request: SubscriptionOpeningRequest): Promise<SubscriptionOpening> {
    return {
      provider: BILLING_PROVIDER_KEYS.STRIPE,
      externalCustomerRef: null,
      externalSubscriptionRef: null,
    }
  }

  async admitRecordedPayment(request: RecordedPaymentRequest): Promise<void> {
    this.lastAdmitRequest = request
    if (this.rejectAdmit) {
      throw new BillingProviderServiceError(
        'Operación no disponible',
        BILLING_PROVIDER_ERROR_CODES.ADAPTER_NOT_REGISTERED,
        500,
        'proveedor-de-cobro-no-soportado',
        'El proveedor de cobro de este registro no está disponible en el sistema. Contacta a soporte.'
      )
    }
  }
}

async function buildPdfReceipt(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage()
  return Buffer.from(await doc.save())
}

async function makeReceipt(): Promise<{
  tmpPath: string
  size: number
  cleanup: () => Promise<void>
}> {
  const pdf = await buildPdfReceipt()
  const tmpPath = join(tmpdir(), `billing-settle-receipt-${Date.now()}-${Math.random()}.pdf`)
  await fs.writeFile(tmpPath, Uint8Array.from(pdf))
  return {
    tmpPath,
    size: pdf.length,
    cleanup: () => fs.unlink(tmpPath).catch(() => undefined),
  }
}

function receiptFile(receipt: { tmpPath: string; size: number }) {
  return {
    tmpPath: receipt.tmpPath,
    clientName: 'comprobante.pdf',
    size: receipt.size,
    headers: { 'content-type': 'application/pdf' },
  }
}

function periodAmountCentsFromSubscription(subscription: BillingSubscription): number {
  return Math.round(Number(subscription.billingSubscriptionContractedTotal) * 100)
}

async function createTenant(stamp: number): Promise<BusinessUnit> {
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Settle Within BU ${stamp}`,
    businessUnitSlug: `settle-within-bu-${stamp}`,
    businessUnitLegalName: `Settle Within Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'self_service',
  })
  return businessUnit
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Settle Within Plan ${stamp}`,
    billingPlanDescription: 'Fixture USRH1790712872597',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 51,
    billingVolumeTierDiscountPercent: 10,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createLiveSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  contractedEmployees: number
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees,
    skipTrial: true,
  })

  const today = toBusinessDateString()
  subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(today).minus({ days: 10 })
  subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(today).plus({ days: 20 })
  await subscription.save()
  return subscription
}

async function createPendingIncreaseFixture(stamp: number) {
  const businessUnit = await createTenant(stamp)
  const planId = await createPublishedPlan(stamp)
  const subscription = await createLiveSubscription(businessUnit, planId, 100)

  subscription.billingSubscriptionCreditBalanceCents = 500
  await subscription.save()

  const changeService = new BillingSubscriptionChangeService()
  const increase = await changeService.requestIncrease(businessUnit.businessUnitId, 150)

  return {
    businessUnit,
    planId,
    subscription,
    proratedCents: increase.proration!.amountCents,
  }
}

function isDeadlockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Deadlock')
}

async function cleanupFixture(params: {
  businessUnitId: number
  planId: number
}) {
  const buId = params.businessUnitId

  await BillingSubscriptionChange.query()
    .where('business_unit_id', buId)
    .update({ billingSubscriptionChangeBillingPaymentId: null })

  const subs = await BillingSubscription.query()
    .where('business_unit_id', buId)
    .select('billing_subscription_id')
  const subIds = subs.map((s) => s.billingSubscriptionId)

  if (subIds.length > 0) {
    await BillingPayment.query().whereIn('billing_subscription_id', subIds).delete()
  }

  await BillingSubscriptionChange.query().where('business_unit_id', buId).delete()
  await BillingSubscription.query().where('business_unit_id', buId).delete()
  await BusinessUnit.query().where('business_unit_id', buId).delete()

  const planSubs = await BillingSubscription.query()
    .where('billing_plan_id', params.planId)
    .select('billing_subscription_id')
  const planSubIds = planSubs.map((s) => s.billingSubscriptionId)
  if (planSubIds.length > 0) {
    await BillingSubscriptionChange.query()
      .whereIn('billing_subscription_id', planSubIds)
      .update({ billingSubscriptionChangeBillingPaymentId: null })
    await BillingPayment.query().whereIn('billing_subscription_id', planSubIds).delete()
    await BillingSubscriptionChange.query().whereIn('billing_subscription_id', planSubIds).delete()
    await BillingSubscription.query().whereIn('billing_subscription_id', planSubIds).delete()
  }

  await BillingVolumeTier.query().where('billing_plan_id', params.planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', params.planId).delete()
  const plan = await BillingPlan.find(params.planId)
  if (plan) await plan.delete()
}

test.group('BillingPaymentService.settlePaymentWithin (USRH1790712872597)', (group) => {
  let uploadCalls = 0
  let deleteCalls = 0
  let originalUpload: UploadService['uploadPrivateBuffer']
  let originalDelete: UploadService['deleteFile']

  group.setup(() => {
    originalUpload = UploadService.prototype.uploadPrivateBuffer
    originalDelete = UploadService.prototype.deleteFile
    UploadService.prototype.uploadPrivateBuffer = async (key) => {
      uploadCalls += 1
      return `test-private/${key}`
    }
    UploadService.prototype.deleteFile = async () => {
      deleteCalls += 1
      return {
        status: 200,
        data: {},
        message: 'file_deleted_successfully',
      } as Awaited<ReturnType<UploadService['deleteFile']>>
    }
  })

  group.each.setup(() => {
    uploadCalls = 0
    deleteCalls = 0
  })

  group.teardown(() => {
    UploadService.prototype.uploadPrivateBuffer = originalUpload
    UploadService.prototype.deleteFile = originalDelete
  })

  test('CA-2: el pago hereda stripe o manual del proveedor de la suscripción', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const probe = new StripeAdmitProbeAdapter()
    const restore = billingProviderRegistry.register(probe)
    const service = new BillingPaymentService()
    const manualReceipt = await makeReceipt()

    const manualFixture = await createPendingIncreaseFixture(stamp)
    const stripeFixture = await createPendingIncreaseFixture(stamp + 1)

    manualFixture.subscription.billingSubscriptionProvider = 'manual'
    await manualFixture.subscription.save()

    stripeFixture.subscription.billingSubscriptionProvider = 'stripe'
    await stripeFixture.subscription.save()

    try {
      const manualResult = await service.registerPayment(
        manualFixture.subscription.billingSubscriptionId,
        {
          amountCents: manualFixture.proratedCents,
          allowCustomAmount: true,
          method: 'transfer',
          reference: 'MANUAL-PRV',
          paidAt: DateTime.now().toISO()!,
        },
        receiptFile(manualReceipt)
      )

      const stripePayment = await BillingPayment.findOrFail(manualResult.billingPaymentId)
      assert.equal(stripePayment.billingPaymentProvider, 'manual')

      const stripeReceipt = await makeReceipt()
      try {
        await service.registerPayment(
          stripeFixture.subscription.billingSubscriptionId,
          {
            amountCents: stripeFixture.proratedCents,
            allowCustomAmount: true,
            method: 'transfer',
            reference: 'STRIPE-PRV',
            paidAt: DateTime.now().toISO()!,
          },
          receiptFile(stripeReceipt)
        )

        const stripeRow = await BillingPayment.query()
          .where('billing_subscription_id', stripeFixture.subscription.billingSubscriptionId)
          .orderBy('billing_payment_id', 'desc')
          .firstOrFail()

        assert.equal(stripeRow.billingPaymentProvider, 'stripe')
        assert.deepEqual(probe.lastAdmitRequest, {
          billingSubscriptionId: stripeFixture.subscription.billingSubscriptionId,
          method: 'transfer',
        })
      } finally {
        await stripeReceipt.cleanup()
      }
    } finally {
      restore()
      await manualReceipt.cleanup()
      await cleanupFixture({
        businessUnitId: manualFixture.businessUnit.businessUnitId,
        planId: manualFixture.planId,
      })
      await cleanupFixture({
        businessUnitId: stripeFixture.businessUnit.businessUnitId,
        planId: stripeFixture.planId,
      })
    }
  })

  test('CA-3: SettlePaymentInput no expone provider y settle estampa desde la fila bloqueada', async ({
    assert,
  }) => {
    const sample: SettlePaymentInput = {
      subscriptionId: 1,
      allowCustomAmount: true,
      amountCents: 1000,
      method: 'transfer',
      reference: null,
      paidAt: DateTime.now().toISO()!,
      receipt: null,
    }
    assert.notProperty(sample, 'provider')

    const stamp = Date.now() + 10
    const probe = new StripeAdmitProbeAdapter()
    const restore = billingProviderRegistry.register(probe)
    const fixture = await createPendingIncreaseFixture(stamp)
    fixture.subscription.billingSubscriptionProvider = 'stripe'
    await fixture.subscription.save()

    const service = new BillingPaymentService()
    try {
      const settled = await db.transaction((trx) =>
        service.settlePaymentWithin(
          {
            subscriptionId: fixture.subscription.billingSubscriptionId,
            amountCents: fixture.proratedCents,
            allowCustomAmount: true,
            method: 'transfer',
            reference: 'SETTLE-STRIPE',
            paidAt: DateTime.now().toISO()!,
            receipt: null,
          },
          trx
        )
      )
      assert.equal(settled.payment.billingPaymentProvider, 'stripe')
    } finally {
      restore()
      await cleanupFixture({
        businessUnitId: fixture.businessUnit.businessUnitId,
        planId: fixture.planId,
      })
    }
  })

  test('CA-4: admisión antes de S3 — proveedor desconocido o rechazo no sube comprobante', async ({
    assert,
  }) => {
    const stamp = Date.now() + 20
    const service = new BillingPaymentService()
    const fixture = await createPendingIncreaseFixture(stamp)
    fixture.subscription.billingSubscriptionProvider = 'desconocido'
    await fixture.subscription.save()

    const paymentsBefore = await BillingPayment.query().where(
      'billing_subscription_id',
      fixture.subscription.billingSubscriptionId
    )
    const receipt = await makeReceipt()

    try {
      try {
        await service.registerPayment(
          fixture.subscription.billingSubscriptionId,
          {
            amountCents: fixture.proratedCents,
            allowCustomAmount: true,
            method: 'transfer',
            paidAt: DateTime.now().toISO()!,
          },
          receiptFile(receipt)
        )
        assert.fail('debía rechazar proveedor desconocido')
      } catch (error) {
        assert.instanceOf(error, BillingProviderServiceError)
        if (error instanceof BillingProviderServiceError) {
          assert.equal(error.errorCode, BILLING_PROVIDER_ERROR_CODES.ADAPTER_NOT_REGISTERED)
        }
      }
      assert.equal(uploadCalls, 0)
      assert.lengthOf(
        await BillingPayment.query().where(
          'billing_subscription_id',
          fixture.subscription.billingSubscriptionId
        ),
        paymentsBefore.length
      )

      const probe = new StripeAdmitProbeAdapter()
      probe.rejectAdmit = true
      const restore = billingProviderRegistry.register(probe)
      fixture.subscription.billingSubscriptionProvider = 'stripe'
      await fixture.subscription.save()

      const receiptRejected = await makeReceipt()
      try {
        await assert.rejects(() =>
          service.registerPayment(
            fixture.subscription.billingSubscriptionId,
            {
              amountCents: fixture.proratedCents,
              allowCustomAmount: true,
              method: 'transfer',
              paidAt: DateTime.now().toISO()!,
            },
            receiptFile(receiptRejected)
          )
        )
        assert.equal(uploadCalls, 0)
      } finally {
        restore()
        await receiptRejected.cleanup()
      }
    } finally {
      await receipt.cleanup()
      await cleanupFixture({
        businessUnitId: fixture.businessUnit.businessUnitId,
        planId: fixture.planId,
      })
    }
  })

  test('CA-5: sin comprobante da las mismas cifras que registerPayment con comprobante', async ({
    assert,
  }) => {
    const stamp = Date.now() + 30
    const fixtureA = await createPendingIncreaseFixture(stamp)
    const fixtureB = await createPendingIncreaseFixture(stamp + 100)

    const periodTotalCents = periodAmountCentsFromSubscription(fixtureA.subscription)
    const amountCents = fixtureA.proratedCents + periodTotalCents + 1234

    const service = new BillingPaymentService()
    const receipt = await makeReceipt()

    try {
      const withReceipt = await service.registerPayment(
        fixtureA.subscription.billingSubscriptionId,
        {
          amountCents,
          allowCustomAmount: true,
          method: 'transfer',
          reference: 'WITH-RECEIPT',
          paidAt: DateTime.now().toISO()!,
        },
        receiptFile(receipt)
      )

      const paymentA = await BillingPayment.findOrFail(withReceipt.billingPaymentId)
      const subA = await BillingSubscription.findOrFail(fixtureA.subscription.billingSubscriptionId)

      const settled = await db.transaction((trx) =>
        service.settlePaymentWithin(
          {
            subscriptionId: fixtureB.subscription.billingSubscriptionId,
            amountCents,
            allowCustomAmount: true,
            method: 'transfer',
            reference: 'NO-RECEIPT',
            paidAt: DateTime.now().toISO()!,
            receipt: null,
          },
          trx
        )
      )

      const paymentB = settled.payment
      const subB = settled.subscription

      for (const field of [
        'billingPaymentDebtAppliedCents',
        'billingPaymentPeriodsCovered',
        'billingPaymentPeriodAmountCents',
        'billingPaymentCreditAppliedCents',
        'billingPaymentCreditBalanceAfterCents',
        'billingPaymentSubtotalCents',
        'billingPaymentTaxAmountCents',
        'billingPaymentTotalCents',
      ] as const) {
        assert.equal(paymentB[field], paymentA[field], field)
      }

      assert.isNotNull(paymentA.billingPaymentReceiptPath)
      assert.isNull(paymentB.billingPaymentReceiptPath)
      assert.isNull(paymentB.billingPaymentReceiptMime)

      assert.equal(subB.billingSubscriptionStatus, subA.billingSubscriptionStatus)
      assert.equal(
        subB.billingSubscriptionCreditBalanceCents,
        subA.billingSubscriptionCreditBalanceCents
      )
      assert.equal(
        subB.billingSubscriptionCurrentPeriodEnd?.toISODate(),
        subA.billingSubscriptionCurrentPeriodEnd?.toISODate()
      )

      const saldoPrevio = 500
      assert.equal(
        saldoPrevio + amountCents,
        paymentB.billingPaymentDebtAppliedCents +
          paymentB.billingPaymentCreditAppliedCents +
          paymentB.billingPaymentCreditBalanceAfterCents
      )
    } finally {
      await receipt.cleanup()
      await cleanupFixture({
        businessUnitId: fixtureA.businessUnit.businessUnitId,
        planId: fixtureA.planId,
      })
      await cleanupFixture({
        businessUnitId: fixtureB.businessUnit.businessUnitId,
        planId: fixtureB.planId,
      })
    }
  })

  test('CA-6: compuertas dentro de settlePaymentWithin', async ({ assert }) => {
    const service = new BillingPaymentService()
    const stamp = Date.now() + 40
    const fixture = await createPendingIncreaseFixture(stamp)

    try {
      await db.transaction((trx) =>
        service.settlePaymentWithin(
          {
            subscriptionId: 9_999_999,
            amountCents: 1000,
            allowCustomAmount: true,
            method: 'transfer',
            reference: null,
            paidAt: DateTime.now().toISO()!,
            receipt: null,
          },
          trx
        )
      )
      assert.fail('debía rechazar suscripción inexistente')
    } catch (error) {
      assert.instanceOf(error, BillingPaymentServiceError)
      if (error instanceof BillingPaymentServiceError) {
        assert.equal(error.errorCode, BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_NOT_FOUND)
      }
    }

    fixture.subscription.billingSubscriptionStatus = 'canceled'
    await fixture.subscription.save()

    try {
      await db.transaction((trx) =>
        service.settlePaymentWithin(
          {
            subscriptionId: fixture.subscription.billingSubscriptionId,
            amountCents: 1000,
            allowCustomAmount: true,
            method: 'transfer',
            reference: null,
            paidAt: DateTime.now().toISO()!,
            receipt: null,
          },
          trx
        )
      )
      assert.fail('debía rechazar suscripción cancelada')
    } catch (error) {
      assert.instanceOf(error, BillingPaymentServiceError)
      if (error instanceof BillingPaymentServiceError) {
        assert.equal(error.errorCode, BILLING_PAYMENT_ERROR_CODES.SUBSCRIPTION_CANCELED)
      }
    }

    fixture.subscription.billingSubscriptionStatus = 'active'
    await fixture.subscription.save()

    const cleanTenant = await createTenant(stamp + 99)
    const cleanPlanId = await createPublishedPlan(stamp + 99)
    const cleanSub = await createLiveSubscription(cleanTenant, cleanPlanId, 10)
    const periodCents = periodAmountCentsFromSubscription(cleanSub)
    const hugeAmount = periodCents * 25 + 500

    try {
      await db.transaction((trx) =>
        service.settlePaymentWithin(
          {
            subscriptionId: cleanSub.billingSubscriptionId,
            amountCents: hugeAmount,
            allowCustomAmount: true,
            method: 'transfer',
            reference: null,
            paidAt: DateTime.now().toISO()!,
            receipt: null,
          },
          trx
        )
      )
      assert.fail('debía rechazar periodos fuera de rango')
    } catch (error) {
      assert.instanceOf(error, BillingPaymentServiceError)
      if (error instanceof BillingPaymentServiceError) {
        assert.equal(error.errorCode, BILLING_PAYMENT_ERROR_CODES.PERIODS_OUT_OF_RANGE)
      }
    }

    await cleanupFixture({
      businessUnitId: fixture.businessUnit.businessUnitId,
      planId: fixture.planId,
    })
    await cleanupFixture({
      businessUnitId: cleanTenant.businessUnitId,
      planId: cleanPlanId,
    })
  })

  test('CA-7: dos settlePaymentWithin concurrentes avanzan dos periodos', async ({ assert }) => {
    const stamp = Date.now() + 50
    const businessUnit = await createTenant(stamp)
    const planId = await createPublishedPlan(stamp)
    const subscription = await createLiveSubscription(businessUnit, planId, 10)
    const periodAmount = periodAmountCentsFromSubscription(subscription)
    const anchorEnd = subscription.billingSubscriptionCurrentPeriodEnd!

    const service = new BillingPaymentService()
    const paidAt = DateTime.now().toISO()!

    try {
      const runSettle = () =>
        db.transaction((trx) =>
          service.settlePaymentWithin(
            {
              subscriptionId: subscription.billingSubscriptionId,
              amountCents: periodAmount,
              allowCustomAmount: true,
              method: 'transfer',
              reference: null,
              paidAt,
              receipt: null,
            },
            trx
          )
        )

      const [first, second] = await Promise.allSettled([runSettle(), runSettle()])
      const outcomes = []
      for (const result of [first, second]) {
        if (result.status === 'fulfilled') {
          outcomes.push(result.value)
          continue
        }
        if (isDeadlockError(result.reason)) {
          outcomes.push(await runSettle())
          continue
        }
        throw result.reason
      }

      assert.lengthOf(outcomes, 2)
      const payments = await BillingPayment.query().where(
        'billing_subscription_id',
        subscription.billingSubscriptionId
      )
      assert.lengthOf(payments, 2)

      const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(
        reloaded.billingSubscriptionCurrentPeriodEnd!.toISODate(),
        anchorEnd.plus({ months: 2 }).toISODate()
      )
      assert.equal(outcomes[1].payment.billingPaymentCreditBalanceAfterCents, 0)
    } finally {
      await cleanupFixture({ businessUnitId: businessUnit.businessUnitId, planId })
    }
  })

  test('CA-8: compensación S3 solo cuando hubo comprobante', async ({ assert }) => {
    const stamp = Date.now() + 60
    const fixture = await createPendingIncreaseFixture(stamp)
    const service = new BillingPaymentService()
    const originalAccrue = AllianceCommissionService.prototype.accrueOnPayment
    AllianceCommissionService.prototype.accrueOnPayment = async () => {
      throw new Error('commission failed')
    }

    const receipt = await makeReceipt()
    try {
      await assert.rejects(() =>
        service.registerPayment(
          fixture.subscription.billingSubscriptionId,
          {
            amountCents: fixture.proratedCents,
            allowCustomAmount: true,
            method: 'transfer',
            paidAt: DateTime.now().toISO()!,
          },
          receiptFile(receipt)
        )
      )
      assert.equal(deleteCalls, 1)
      const paymentsAfterFailedRegister = await BillingPayment.query().where(
        'billing_subscription_id',
        fixture.subscription.billingSubscriptionId
      )
      assert.equal(paymentsAfterFailedRegister.length, 0)

      deleteCalls = 0
      await assert.rejects(() =>
        db.transaction((trx) =>
          service.settlePaymentWithin(
            {
              subscriptionId: fixture.subscription.billingSubscriptionId,
              amountCents: fixture.proratedCents,
              allowCustomAmount: true,
              method: 'transfer',
              reference: null,
              paidAt: DateTime.now().toISO()!,
              receipt: null,
            },
            trx
          )
        )
      )
      assert.equal(deleteCalls, 0)
    } finally {
      AllianceCommissionService.prototype.accrueOnPayment = originalAccrue
      await receipt.cleanup()
      await cleanupFixture({
        businessUnitId: fixture.businessUnit.businessUnitId,
        planId: fixture.planId,
      })
    }
  })
})

test.group('BillingPaymentService.settlePaymentWithin — periodo del proveedor (9115 / CA-3…CA-9)', () => {
  async function settleDirect(
    subscriptionId: number,
    overrides: Partial<SettlePaymentInput> & Pick<SettlePaymentInput, 'amountCents'>
  ) {
    const service = new BillingPaymentService()
    const paidAt = DateTime.now().toISO()!
    return db.transaction((trx) =>
      service.settlePaymentWithin(
        {
          subscriptionId,
          allowCustomAmount: true,
          method: 'transfer',
          reference: null,
          paidAt,
          receipt: null,
          ...overrides,
        },
        trx
      )
    )
  }

  test('CA-3: tope de un periodo con saldo que alcanza para tres', async ({ assert }) => {
    const stamp = Date.now() + 9115
    const buProvider = await createTenant(stamp)
    const buManual = await createTenant(stamp + 1)
    const planProvider = await createPublishedPlan(stamp)
    const planManual = await createPublishedPlan(stamp + 1)
    const subProvider = await createLiveSubscription(buProvider, planProvider, 10)
    const subManual = await createLiveSubscription(buManual, planManual, 10)
    const P = periodAmountCentsFromSubscription(subProvider)
    const today = todayInBusinessZone()
    const E = today.plus({ days: 10 })

    subProvider.billingSubscriptionCreditBalanceCents = 2 * P
    subProvider.billingSubscriptionCurrentPeriodStart = E.minus({ months: 1 })
    subProvider.billingSubscriptionCurrentPeriodEnd = E
    await subProvider.save()

    subManual.billingSubscriptionCreditBalanceCents = 2 * P
    subManual.billingSubscriptionCurrentPeriodStart = E.minus({ months: 1 })
    subManual.billingSubscriptionCurrentPeriodEnd = E
    await subManual.save()

    try {
      const withProvider = await settleDirect(subProvider.billingSubscriptionId, {
        amountCents: P,
        providerPeriod: {
          start: E.toISODate()!,
          end: E.plus({ months: 1 }).toISODate()!,
        },
      })

      assert.equal(withProvider.payment.billingPaymentPeriodsCovered, 1)
      assert.equal(withProvider.payment.billingPaymentCreditAppliedCents, P)
      assert.equal(withProvider.payment.billingPaymentDebtAppliedCents, 0)
      assert.equal(withProvider.payment.billingPaymentCreditBalanceAfterCents, 2 * P)
      assert.equal(
        withProvider.subscription.billingSubscriptionCurrentPeriodStart!.toISODate(),
        E.toISODate()
      )
      assert.equal(
        withProvider.subscription.billingSubscriptionCurrentPeriodEnd!.toISODate(),
        E.plus({ months: 1 }).toISODate()
      )

      const withoutProvider = await settleDirect(subManual.billingSubscriptionId, {
        amountCents: P,
      })
      assert.equal(withoutProvider.payment.billingPaymentPeriodsCovered, 3)
      assert.equal(
        withoutProvider.subscription.billingSubscriptionCurrentPeriodEnd!.toISODate(),
        E.plus({ months: 3 }).toISODate()
      )
    } finally {
      await cleanupFixture({ businessUnitId: buProvider.businessUnitId, planId: planProvider })
      await cleanupFixture({ businessUnitId: buManual.businessUnitId, planId: planManual })
    }
  })

  test('CA-4: fechas del proveedor cuando el periodo vigente venció', async ({ assert }) => {
    const stamp = Date.now() + 9116
    const buProvider = await createTenant(stamp)
    const buManual = await createTenant(stamp + 1)
    const planProvider = await createPublishedPlan(stamp)
    const planManual = await createPublishedPlan(stamp + 1)
    const subProvider = await createLiveSubscription(buProvider, planProvider, 10)
    const subManual = await createLiveSubscription(buManual, planManual, 10)
    const P = periodAmountCentsFromSubscription(subProvider)
    const today = todayInBusinessZone()
    const expiredEnd = today.minus({ days: 4 })
    const providerStart = expiredEnd.toISODate()!
    const providerEnd = expiredEnd.plus({ months: 1 }).toISODate()!

    for (const sub of [subProvider, subManual]) {
      sub.billingSubscriptionCreditBalanceCents = 0
      sub.billingSubscriptionCurrentPeriodStart = expiredEnd.minus({ months: 1 })
      sub.billingSubscriptionCurrentPeriodEnd = expiredEnd
      await sub.save()
    }

    try {
      const withProvider = await settleDirect(subProvider.billingSubscriptionId, {
        amountCents: P,
        providerPeriod: { start: providerStart, end: providerEnd },
      })
      assert.equal(
        withProvider.subscription.billingSubscriptionCurrentPeriodStart!.toISODate(),
        providerStart
      )
      assert.notEqual(
        withProvider.subscription.billingSubscriptionCurrentPeriodStart!.toISODate(),
        today.toISODate()
      )

      const manualAnchor = await settleDirect(subManual.billingSubscriptionId, {
        amountCents: P,
      })
      assert.equal(
        manualAnchor.subscription.billingSubscriptionCurrentPeriodStart!.toISODate(),
        today.toISODate()
      )
    } finally {
      await cleanupFixture({ businessUnitId: buProvider.businessUnitId, planId: planProvider })
      await cleanupFixture({ businessUnitId: buManual.businessUnitId, planId: planManual })
    }
  })

  test('CA-5: adeudo primero y luego un periodo con providerPeriod', async ({ assert }) => {
    const stamp = Date.now() + 9117
    const fixture = await createPendingIncreaseFixture(stamp)
    const D = fixture.proratedCents
    const paymentService = new BillingPaymentService()
    const composite = await paymentService.resolveCompositeIncreaseAmounts(fixture.subscription)
    assert.isNotNull(composite)
    const P = composite!.periodCents
    const today = todayInBusinessZone()
    const futureEnd = today.plus({ days: 30 })

    fixture.subscription.billingSubscriptionCreditBalanceCents = 0
    fixture.subscription.billingSubscriptionCurrentPeriodStart = today
    fixture.subscription.billingSubscriptionCurrentPeriodEnd = futureEnd
    await fixture.subscription.save()

    try {
      const result = await settleDirect(fixture.subscription.billingSubscriptionId, {
        amountCents: D + P,
        providerPeriod: {
          start: futureEnd.toISODate()!,
          end: futureEnd.plus({ months: 1 }).toISODate()!,
        },
      })

      assert.equal(result.payment.billingPaymentDebtAppliedCents, D)
      assert.equal(result.payment.billingPaymentPeriodsCovered, 1)
      assert.equal(result.payment.billingPaymentCreditAppliedCents, P)
      assert.equal(result.payment.billingPaymentCreditBalanceAfterCents, 0)
      assert.equal(result.applyOutcome.outcome, 'applied')
    } finally {
      await cleanupFixture({
        businessUnitId: fixture.businessUnit.businessUnitId,
        planId: fixture.planId,
      })
    }
  })

  test('CA-6: el periodo nunca retrocede', async ({ assert }) => {
    const cases = [
      { start: '2026-11-01', end: '2026-12-01' },
      { start: '2026-10-01', end: '2026-11-01' },
    ] as const

    for (const providerPeriod of cases) {
        const stampCase = Date.now() + Math.random()
        const bu = await createTenant(stampCase)
        const planId = await createPublishedPlan(stampCase)
        const sub = await createLiveSubscription(bu, planId, 10)
        const caseP = periodAmountCentsFromSubscription(sub)
        sub.billingSubscriptionCreditBalanceCents = 0
        sub.billingSubscriptionCurrentPeriodStart = DateTime.fromISO('2026-11-01')
        sub.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO('2026-12-01')
        await sub.save()

        const result = await settleDirect(sub.billingSubscriptionId, {
          amountCents: caseP,
          providerPeriod,
        })
        assert.equal(result.payment.billingPaymentPeriodsCovered, 0)
        assert.equal(result.payment.billingPaymentCreditAppliedCents, 0)
        assert.equal(result.payment.billingPaymentCreditBalanceAfterCents, caseP)
        assert.isNull(result.payment.billingPaymentPeriodStart)
        assert.isNull(result.payment.billingPaymentPeriodEnd)
        assert.equal(
          result.subscription.billingSubscriptionCurrentPeriodStart!.toISODate(),
          '2026-11-01'
        )
        assert.equal(
          result.subscription.billingSubscriptionCurrentPeriodEnd!.toISODate(),
          '2026-12-01'
        )
        await cleanupFixture({ businessUnitId: bu.businessUnitId, planId })
    }
  })

  test('CA-7: monto insuficiente para cubrir un periodo', async ({ assert }) => {
    const stamp = Date.now() + 9119
    const businessUnit = await createTenant(stamp)
    const planId = await createPublishedPlan(stamp)
    const subscription = await createLiveSubscription(businessUnit, planId, 10)
    const P = periodAmountCentsFromSubscription(subscription)
    const today = todayInBusinessZone()
    const futureEnd = today.plus({ days: 20 })
    subscription.billingSubscriptionCurrentPeriodEnd = futureEnd
    await subscription.save()

    try {
      const result = await settleDirect(subscription.billingSubscriptionId, {
        amountCents: P - 100,
        providerPeriod: {
          start: futureEnd.toISODate()!,
          end: futureEnd.plus({ months: 1 }).toISODate()!,
        },
      })
      assert.equal(result.payment.billingPaymentPeriodsCovered, 0)
      assert.isNull(result.payment.billingPaymentPeriodStart)
      assert.equal(result.payment.billingPaymentCreditBalanceAfterCents, P - 100)
    } finally {
      await cleanupFixture({ businessUnitId: businessUnit.businessUnitId, planId })
    }
  })

  test('CA-8: referencias del proveedor y unicidad por factura', async ({ assert }) => {
    const stamp = Date.now() + 9120
    const buA = await createTenant(stamp)
    const buB = await createTenant(stamp + 1)
    const planA = await createPublishedPlan(stamp)
    const planB = await createPublishedPlan(stamp + 1)
    const subA = await createLiveSubscription(buA, planA, 10)
    const subB = await createLiveSubscription(buB, planB, 10)
    const P = periodAmountCentsFromSubscription(subA)

    try {
      await settleDirect(subA.billingSubscriptionId, {
        amountCents: P,
        method: 'card',
        providerInvoiceId: 'in_fixtureP1',
        providerPaymentRef: 'pi_fixtureP1',
        providerEventId: 'evt_fixtureP1',
      })

      const row = await BillingPayment.query()
        .where('billing_subscription_id', subA.billingSubscriptionId)
        .orderBy('billing_payment_id', 'desc')
        .firstOrFail()
      assert.equal(row.billingPaymentProviderInvoiceId, 'in_fixtureP1')
      assert.equal(row.billingPaymentProviderPaymentRef, 'pi_fixtureP1')
      assert.equal(row.billingPaymentProviderEventId, 'evt_fixtureP1')

      await assert.rejects(() =>
        settleDirect(subB.billingSubscriptionId, {
          amountCents: P,
          method: 'card',
          providerInvoiceId: 'in_fixtureP1',
        })
      )

      await settleDirect(subA.billingSubscriptionId, {
        amountCents: P,
        method: 'transfer',
      })
      await settleDirect(subA.billingSubscriptionId, {
        amountCents: P,
        method: 'cash',
      })
      const manualRows = await BillingPayment.query()
        .where('billing_subscription_id', subA.billingSubscriptionId)
        .whereIn('billing_payment_method', ['transfer', 'cash'])
      assert.isTrue(
        manualRows.every(
          (p) =>
            p.billingPaymentProviderInvoiceId === null &&
            p.billingPaymentProviderPaymentRef === null &&
            p.billingPaymentProviderEventId === null
        )
      )
    } finally {
      await cleanupFixture({ businessUnitId: buA.businessUnitId, planId: planA })
      await cleanupFixture({ businessUnitId: buB.businessUnitId, planId: planB })
    }
  })

  test('CA-9: providerPeriod inválido no inserta pago', async ({ assert }) => {
    const stamp = Date.now() + 9121
    const businessUnit = await createTenant(stamp)
    const planId = await createPublishedPlan(stamp)
    const subscription = await createLiveSubscription(businessUnit, planId, 10)
    const P = periodAmountCentsFromSubscription(subscription)

    try {
      await assert.rejects(async () =>
        settleDirect(subscription.billingSubscriptionId, {
          amountCents: P,
          providerPeriod: { start: '2026-13-40', end: '2026-14-01' },
        })
      )

      const count = await BillingPayment.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .count('* as total')
      assert.equal(Number(count[0]?.$extras.total ?? 0), 0)
    } finally {
      await cleanupFixture({ businessUnitId: businessUnit.businessUnitId, planId })
    }
  })
})

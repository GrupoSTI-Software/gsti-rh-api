import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import BillingPayment from '#models/billing_payment'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import { toBusinessDateString } from '#utils/business_date'

/**
 * Tests funcionales — USRH1787714804405 · Conservar el descuento al cambiar
 * la cantidad contratada.
 *
 * Ejercen `BillingSubscriptionChangeService` directamente (mismo patrón que
 * el grupo "Candado temporal §4.4" de `billing_subscription_discount_code.spec.ts`)
 * para no depender del seed de roles del tenant (HTTP), que en este entorno
 * local tiene datos huérfanos preexistentes no relacionados con esta historia.
 *
 * Fixture y cifras verbatim del Anexo A del spec: plan 79.00/empleado, IVA
 * 0.16, tramos 0% desde 1 / 10% desde 100 / 15% desde 200, código FJGHA897
 * percent 15% × 3 periodos, 1 ya consumido. Periodo de 30 días, 12 restantes.
 */

const LIST_UNIT_AMOUNT = 79
const TAX_RATE = 0.16
const CODE_TEXT = 'FJGHA897'

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `HU9 Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1787714804405',
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
    billingVolumeTierDiscountPercent: 0,
  })
  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 100,
    billingVolumeTierDiscountPercent: 10,
  })
  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 200,
    billingVolumeTierDiscountPercent: 15,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `HU9 BU ${stamp}`
  businessUnit.businessUnitSlug = `hu9-bu-${stamp}`
  businessUnit.businessUnitLegalName = `HU9 Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

interface FixtureOptions {
  contractedEmployees: number
  benefitPeriods: number | null
  benefitPeriodsUsed: number
  /** Si es `false`, crea la suscripción sin código (no regresión). */
  withCode?: boolean
}

/**
 * Crea directamente la suscripción viva ya congelada al tamaño y estado del
 * código pedidos (sin pasar por `createSubscription`/canje): permite fijar
 * `benefitPeriodsUsed` en cualquier valor, incluido "agotado", sin depender
 * de una secuencia de pagos previa (eslabón 8, fuera de esta HU).
 */
async function createLiveSubscription(
  businessUnit: BusinessUnit,
  planId: number,
  options: FixtureOptions
): Promise<BillingSubscription> {
  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', planId)
    .firstOrFail()

  const catalog = new BillingCatalogService()
  const withCode = options.withCode ?? true
  const exhausted =
    withCode &&
    options.benefitPeriods !== null &&
    options.benefitPeriodsUsed >= options.benefitPeriods

  const resolved = await catalog.resolvePrice(
    planId,
    options.contractedEmployees,
    toBusinessDateString(),
    withCode && !exhausted ? { kind: 'percent', value: 15 } : undefined
  )

  const now = DateTime.now()
  const today = toBusinessDateString()

  const subscription = await BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: planId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: 'active',
    billingSubscriptionContractedUnitAmount: resolved.pricePerEmployee,
    billingSubscriptionContractedEmployees: options.contractedEmployees,
    billingSubscriptionDiscountPercent: resolved.discountPercent,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: TAX_RATE,
    billingSubscriptionContractedSubtotal: resolved.subtotal,
    billingSubscriptionContractedTaxAmount: resolved.taxAmount,
    billingSubscriptionContractedTotal: resolved.total,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: DateTime.fromISO(today, {
      zone: 'America/Mexico_City',
    }).minus({ days: 18 }),
    billingSubscriptionCurrentPeriodEnd: DateTime.fromISO(today, {
      zone: 'America/Mexico_City',
    }).plus({ days: 12 }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
    billingSubscriptionDiscountCodeText: withCode ? CODE_TEXT : null,
    billingSubscriptionDiscountCodeKind: withCode ? 'percent' : null,
    billingSubscriptionDiscountCodeValue: withCode ? 15 : null,
    billingSubscriptionDiscountCodeBenefitPeriods: withCode ? options.benefitPeriods : null,
    billingSubscriptionDiscountCodeBenefitPeriodsUsed: withCode ? options.benefitPeriodsUsed : 0,
    billingSubscriptionCodeDiscountAmount: withCode ? resolved.codeDiscountAmount ?? 0 : 0,
    billingSubscriptionUndiscountedUnitAmount: withCode
      ? resolved.undiscountedPricePerEmployee ?? resolved.pricePerEmployee
      : null,
    billingSubscriptionUndiscountedSubtotal: withCode
      ? resolved.undiscountedSubtotal ?? resolved.subtotal
      : null,
    billingSubscriptionUndiscountedTaxAmount: withCode
      ? resolved.undiscountedTaxAmount ?? resolved.taxAmount
      : null,
    billingSubscriptionUndiscountedTotal: withCode
      ? resolved.undiscountedTotal ?? resolved.total
      : null,
  })

  return subscription
}

/** Fila mínima de `billing_payments` (append-only) para satisfacer la FK del cambio. */
async function createDummyPayment(subscription: BillingSubscription): Promise<number> {
  const payment = await BillingPayment.create({
    billingSubscriptionId: subscription.billingSubscriptionId,
    billingPaymentAmountCents: 1,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: 'HU9-fixture',
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.now(),
    billingPaymentPeriodStart: subscription.billingSubscriptionCurrentPeriodStart,
    billingPaymentPeriodEnd: subscription.billingSubscriptionCurrentPeriodEnd,
  } as never)
  return payment.billingPaymentId
}

async function cleanup(businessUnitId: number, planId: number | null) {
  await BillingSubscriptionChange.query()
    .where('business_unit_id', businessUnitId)
    .update({ billingSubscriptionChangeBillingPaymentId: null })
  await BillingPayment.query()
    .whereIn(
      'billing_subscription_id',
      BillingSubscription.query().where('business_unit_id', businessUnitId).select(
        'billing_subscription_id'
      )
    )
    .delete()
  await BillingSubscriptionChange.query().where('business_unit_id', businessUnitId).delete()
  await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  if (planId) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) await plan.delete()
  }
}

test.group(
  'BillingSubscriptionChangeService — descuento del código en cambios de cupo (USRH1787714804405)',
  () => {
    test('CA-1: previewChange expone undiscounted*/codeDiscountAmount y prorratea con descuento', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-1`
      const planId = await createPublishedPlan(Date.now())
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionChangeService()

      try {
        const subscription = await createLiveSubscription(businessUnit, planId, {
          contractedEmployees: 120,
          benefitPeriods: 3,
          benefitPeriodsUsed: 1,
        })
        assert.equal(subscription.billingSubscriptionContractedTotal, 8412.55)
        assert.equal(subscription.billingSubscriptionUndiscountedTotal, 9897.12)
        assert.equal(subscription.billingSubscriptionCodeDiscountAmount, 1279.8)

        const preview = await service.previewChange(businessUnit.businessUnitId, 150)

        assert.equal(preview.changeType, 'increase')
        assert.equal(preview.newAmounts.subtotal, 9065.25)
        assert.equal(preview.newAmounts.taxAmount, 1450.44)
        assert.equal(preview.newAmounts.total, 10515.69)
        assert.equal(preview.newAmounts.codeDiscountAmount, 1599.75)
        assert.equal(preview.newAmounts.discountPercent, 10)
        assert.equal(preview.newAmounts.undiscountedTotal, 12371.4)
        assert.isNotNull(preview.proration)
        assert.equal(preview.proration!.amountCents, 84126)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('CA-4: cruce de tramo de volumen acumula los dos descuentos en orden', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-4`
      const planId = await createPublishedPlan(Date.now() + 1)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionChangeService()

      try {
        await createLiveSubscription(businessUnit, planId, {
          contractedEmployees: 120,
          benefitPeriods: 3,
          benefitPeriodsUsed: 1,
        })

        const preview = await service.previewChange(businessUnit.businessUnitId, 250)

        assert.equal(preview.newAmounts.discountPercent, 15)
        assert.equal(preview.newAmounts.undiscountedSubtotal, 16787.5)
        assert.equal(preview.newAmounts.codeDiscountAmount, 2518.13)
        assert.equal(preview.newAmounts.subtotal, 14269.37)
        assert.equal(preview.newAmounts.total, 16552.47)
        assert.equal(preview.proration!.amountCents, 325597)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('CA-2: requestIncrease congela el trato con código y applyIncreaseOnPayment lo transcribe sin mover el contador', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-2`
      const planId = await createPublishedPlan(Date.now() + 2)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionChangeService()

      try {
        const subscription = await createLiveSubscription(businessUnit, planId, {
          contractedEmployees: 120,
          benefitPeriods: 3,
          benefitPeriodsUsed: 1,
        })

        const result = await service.requestIncrease(businessUnit.businessUnitId, 150)
        assert.equal(result.billingSubscriptionChangeStatus, 'pending_payment')
        assert.equal(result.proration!.amountCents, 84126)

        const change = await BillingSubscriptionChange.findOrFail(
          result.billingSubscriptionChangeId
        )
        assert.equal(Number(change.billingSubscriptionChangeSubtotal), 9065.25)
        assert.equal(Number(change.billingSubscriptionChangeTotal), 10515.69)
        assert.equal(Number(change.billingSubscriptionChangeCodeDiscountAmount), 1599.75)
        assert.equal(Number(change.billingSubscriptionChangeUndiscountedSubtotal), 10665.0)
        assert.equal(Number(change.billingSubscriptionChangeUndiscountedTotal), 12371.4)
        assert.equal(Number(change.billingSubscriptionChangeUndiscountedUnitAmount), 79.0)
        assert.equal(change.billingSubscriptionChangeDiscountCodeText, CODE_TEXT)
        assert.equal(change.billingSubscriptionChangeDiscountCodeKind, 'percent')
        assert.equal(change.billingSubscriptionChangeProratedAmountCents, 84126)

        const paymentId = await createDummyPayment(subscription)
        const outcome = await db.transaction(async (trx) => {
          const lockedSub = await BillingSubscription.query({ client: trx })
            .where('billing_subscription_id', subscription.billingSubscriptionId)
            .forUpdate()
            .firstOrFail()
          const applied = await service.applyIncreaseOnPayment(lockedSub, paymentId, 84126, trx)
          await lockedSub.save()
          return applied
        })

        assert.equal(outcome.outcome, 'applied')

        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionContractedEmployees, 150)
        assert.equal(Number(reloaded.billingSubscriptionContractedSubtotal), 9065.25)
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), 10515.69)
        assert.equal(Number(reloaded.billingSubscriptionCodeDiscountAmount), 1599.75)
        assert.equal(Number(reloaded.billingSubscriptionUndiscountedSubtotal), 10665.0)
        assert.equal(Number(reloaded.billingSubscriptionUndiscountedTotal), 12371.4)
        assert.equal(Number(reloaded.billingSubscriptionUndiscountedUnitAmount), 79.0)
        assert.equal(Number(reloaded.billingSubscriptionDiscountPercent), 10)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 1)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('CA-3: scheduleDecrease congela el trato con código y applyScheduledDecrease lo transcribe', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-3`
      const planId = await createPublishedPlan(Date.now() + 3)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionChangeService()

      try {
        const subscription = await createLiveSubscription(businessUnit, planId, {
          contractedEmployees: 120,
          benefitPeriods: 3,
          benefitPeriodsUsed: 1,
        })

        const result = await service.scheduleDecrease(businessUnit.businessUnitId, 100)
        assert.equal(result.billingSubscriptionChangeStatus, 'scheduled')

        const change = await BillingSubscriptionChange.findOrFail(
          result.billingSubscriptionChangeId
        )
        assert.equal(Number(change.billingSubscriptionChangeCodeDiscountAmount), 1066.5)
        assert.equal(Number(change.billingSubscriptionChangeSubtotal), 6043.5)
        assert.equal(Number(change.billingSubscriptionChangeTotal), 7010.46)
        assert.equal(Number(change.billingSubscriptionChangeUndiscountedTotal), 8247.6)
        assert.equal(change.billingSubscriptionChangeDiscountCodeText, CODE_TEXT)

        const periodEndIso = subscription.billingSubscriptionCurrentPeriodEnd!.toISODate()!
        const outcome = await service.applyScheduledDecrease(subscription, periodEndIso)
        assert.equal(outcome.outcome, 'applied')

        const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(reloaded.billingSubscriptionContractedEmployees, 100)
        assert.equal(Number(reloaded.billingSubscriptionContractedSubtotal), 6043.5)
        assert.equal(Number(reloaded.billingSubscriptionContractedTaxAmount), 966.96)
        assert.equal(Number(reloaded.billingSubscriptionContractedTotal), 7010.46)
        assert.equal(Number(reloaded.billingSubscriptionCodeDiscountAmount), 1066.5)
        assert.equal(Number(reloaded.billingSubscriptionUndiscountedSubtotal), 7110.0)
        assert.equal(Number(reloaded.billingSubscriptionDiscountPercent), 10)
        assert.equal(reloaded.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 1)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('CA-6: beneficio agotado — el trato nuevo se calcula sin código y no se borran las condiciones', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-6`
      const planId = await createPublishedPlan(Date.now() + 4)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionChangeService()

      try {
        await createLiveSubscription(businessUnit, planId, {
          contractedEmployees: 120,
          benefitPeriods: 3,
          benefitPeriodsUsed: 3,
        })

        const result = await service.requestIncrease(businessUnit.businessUnitId, 150)
        const change = await BillingSubscriptionChange.findOrFail(
          result.billingSubscriptionChangeId
        )

        assert.equal(Number(change.billingSubscriptionChangeSubtotal), 10665.0)
        assert.equal(Number(change.billingSubscriptionChangeTotal), 12371.4)
        assert.equal(Number(change.billingSubscriptionChangeCodeDiscountAmount), 0)
        assert.equal(Number(change.billingSubscriptionChangeUndiscountedTotal), 12371.4)
        // El texto/tipo se congelan como evidencia aunque el beneficio esté agotado.
        assert.equal(change.billingSubscriptionChangeDiscountCodeText, CODE_TEXT)
        assert.equal(result.proration!.amountCents, 98971)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('CA-8: código desfasado entre el congelado y el pago — not_applicable, nada se toca', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-8`
      const planId = await createPublishedPlan(Date.now() + 5)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionChangeService()

      try {
        const subscription = await createLiveSubscription(businessUnit, planId, {
          contractedEmployees: 120,
          benefitPeriods: 3,
          benefitPeriodsUsed: 1,
        })

        const result = await service.requestIncrease(businessUnit.businessUnitId, 150)

        // Entre el congelado y el pago, el beneficio se agota (eslabón 8, fuera de esta HU).
        subscription.billingSubscriptionDiscountCodeBenefitPeriodsUsed = 3
        subscription.billingSubscriptionContractedSubtotal = 8532.0
        subscription.billingSubscriptionContractedTaxAmount = 1365.12
        subscription.billingSubscriptionContractedTotal = 9897.12
        subscription.billingSubscriptionCodeDiscountAmount = 0
        subscription.billingSubscriptionUndiscountedSubtotal = 8532.0
        subscription.billingSubscriptionUndiscountedTaxAmount = 1365.12
        subscription.billingSubscriptionUndiscountedTotal = 9897.12
        await subscription.save()

        const before = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        const paymentId = await createDummyPayment(subscription)
        const outcome = await db.transaction(async (trx) => {
          const lockedSub = await BillingSubscription.query({ client: trx })
            .where('billing_subscription_id', subscription.billingSubscriptionId)
            .forUpdate()
            .firstOrFail()
          return service.applyIncreaseOnPayment(lockedSub, paymentId, 84126, trx)
        })

        assert.equal(outcome.outcome, 'not_applicable')
        if (outcome.outcome === 'not_applicable') {
          assert.equal(outcome.reason, 'descuento-desfasado')
        }

        const change = await BillingSubscriptionChange.findOrFail(
          result.billingSubscriptionChangeId
        )
        assert.equal(change.billingSubscriptionChangeStatus, 'not_applicable')
        assert.equal(change.billingSubscriptionChangeNotApplicableReason, 'descuento-desfasado')

        const after = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(
          after.billingSubscriptionContractedEmployees,
          before.billingSubscriptionContractedEmployees
        )
        assert.equal(
          Number(after.billingSubscriptionContractedTotal),
          Number(before.billingSubscriptionContractedTotal)
        )
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('CA-9: cancelar un cambio vivo no toca la suscripción', async ({ assert }) => {
      const stamp = `${Date.now()}-9`
      const planId = await createPublishedPlan(Date.now() + 6)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionChangeService()

      try {
        const subscription = await createLiveSubscription(businessUnit, planId, {
          contractedEmployees: 120,
          benefitPeriods: 3,
          benefitPeriodsUsed: 1,
        })
        const before = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)

        await service.requestIncrease(businessUnit.businessUnitId, 150)
        const cancelResult = await service.cancelLiveChange(businessUnit.businessUnitId)
        assert.equal(cancelResult.billingSubscriptionChangeStatus, 'canceled')

        const after = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
        assert.equal(
          after.billingSubscriptionContractedEmployees,
          before.billingSubscriptionContractedEmployees
        )
        assert.equal(
          Number(after.billingSubscriptionContractedTotal),
          Number(before.billingSubscriptionContractedTotal)
        )
        assert.equal(
          after.billingSubscriptionDiscountCodeBenefitPeriodsUsed,
          before.billingSubscriptionDiscountCodeBenefitPeriodsUsed
        )
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })

    test('CA-10: sin código, previewChange/requestIncrease se comportan como antes', async ({
      assert,
    }) => {
      const stamp = `${Date.now()}-10`
      const planId = await createPublishedPlan(Date.now() + 7)
      const businessUnit = await createBusinessUnit(stamp)
      const service = new BillingSubscriptionChangeService()

      try {
        await createLiveSubscription(businessUnit, planId, {
          contractedEmployees: 120,
          benefitPeriods: null,
          benefitPeriodsUsed: 0,
          withCode: false,
        })

        const preview = await service.previewChange(businessUnit.businessUnitId, 150)
        assert.isUndefined(preview.newAmounts.codeDiscountAmount)
        assert.isUndefined(preview.newAmounts.undiscountedTotal)
        assert.equal(preview.newAmounts.total, 12371.4)

        const result = await service.requestIncrease(businessUnit.businessUnitId, 150)
        const change = await BillingSubscriptionChange.findOrFail(
          result.billingSubscriptionChangeId
        )
        assert.equal(Number(change.billingSubscriptionChangeCodeDiscountAmount), 0)
        assert.isNull(change.billingSubscriptionChangeUndiscountedTotal)
        assert.isNull(change.billingSubscriptionChangeDiscountCodeText)
      } finally {
        await cleanup(businessUnit.businessUnitId, planId)
      }
    })
  }
)

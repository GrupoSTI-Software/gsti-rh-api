import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService, { type AppliedDiscountCode } from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { BillingSubscriptionServiceError } from '#exceptions/billing_subscription_service_error'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { toBusinessDateString } from '#utils/business_date'

/**
 * Tests funcionales — USRH1787714804406 · Resolver el código al cambiar de plan.
 *
 * Ejercen `BillingSubscriptionService.changePlan` directamente (mismo patrón
 * que `billing_subscription_change_discount_code.spec.ts` del eslabón 9),
 * sin depender del seed de roles del tenant (HTTP).
 *
 * Fixture y cifras verbatim del spec: suscripción de 120 empleados, plan
 * origen 79.00/empleado, IVA 0.16, tramo de volumen 10% desde 100, código
 * FJGHA897 percent 15% × 3 periodos con 1 ya consumido. Plan destino
 * 95.00/empleado, mismo tramo, mismo IVA.
 */

const TAX_RATE = 0.16
const CODE_TEXT = 'FJGHA897'

async function createPublishedPlan(unitAmount: number, stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `HU10 Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1787714804406',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: unitAmount,
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

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `HU10 BU ${stamp}`
  businessUnit.businessUnitSlug = `hu10-bu-${stamp}`
  businessUnit.businessUnitLegalName = `HU10 Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

interface FixtureOptions {
  contractedEmployees: number
  code?: AppliedDiscountCode | null
  benefitPeriods: number | null
  benefitPeriodsUsed: number
}

/**
 * Crea directamente la suscripción viva ya congelada al tamaño y estado del
 * código pedidos (sin pasar por `createSubscription`/canje), igual que el
 * eslabón 9: permite fijar `benefitPeriodsUsed` en cualquier valor sin
 * depender de una secuencia de pagos previa.
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
  const withCode = options.code !== undefined && options.code !== null
  const exhausted =
    withCode && options.benefitPeriods !== null && options.benefitPeriodsUsed >= options.benefitPeriods

  const resolved = await catalog.resolvePrice(
    planId,
    options.contractedEmployees,
    toBusinessDateString(),
    withCode && !exhausted ? options.code! : undefined
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
    billingSubscriptionDiscountCodeKind: withCode ? options.code!.kind : null,
    billingSubscriptionDiscountCodeValue: withCode ? options.code!.value : null,
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

async function cleanup(businessUnitId: number, planIds: (number | null)[]) {
  await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  for (const planId of planIds) {
    if (!planId) continue
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) await plan.delete()
  }
}

test.group('BillingSubscriptionService.changePlan — código de descuento (USRH1787714804406)', () => {
  test('CA-1: conserva percent y recalcula sobre el plan nuevo, sin mover los periodos consumidos', async ({
    assert,
  }) => {
    const stamp = `${Date.now()}-1`
    const planOldId = await createPublishedPlan(79, Date.now())
    const planNewId = await createPublishedPlan(95, Date.now() + 1)
    const businessUnit = await createBusinessUnit(stamp)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await createLiveSubscription(businessUnit, planOldId, {
        contractedEmployees: 120,
        code: { kind: 'percent', value: 15 },
        benefitPeriods: 3,
        benefitPeriodsUsed: 1,
      })
      assert.equal(Number(subscription.billingSubscriptionContractedTotal), 8412.55)

      const updated = await service.changePlan(subscription.billingSubscriptionId, planNewId)

      assert.equal(updated.billingPlanId, planNewId)
      assert.equal(Number(updated.billingSubscriptionContractedUnitAmount), 95.0)
      assert.equal(Number(updated.billingSubscriptionDiscountPercent), 10.0)
      assert.equal(Number(updated.billingSubscriptionContractedSubtotal), 8721.0)
      assert.equal(Number(updated.billingSubscriptionContractedTaxAmount), 1395.36)
      assert.equal(Number(updated.billingSubscriptionContractedTotal), 10116.36)
      assert.equal(Number(updated.billingSubscriptionCodeDiscountAmount), 1539.0)
      assert.equal(Number(updated.billingSubscriptionUndiscountedUnitAmount), 95.0)
      assert.equal(Number(updated.billingSubscriptionUndiscountedSubtotal), 10260.0)
      assert.equal(Number(updated.billingSubscriptionUndiscountedTaxAmount), 1641.6)
      assert.equal(Number(updated.billingSubscriptionUndiscountedTotal), 11901.6)

      // Condiciones congeladas sin cambio; los periodos consumidos no se mueven.
      assert.equal(updated.billingSubscriptionDiscountCodeText, CODE_TEXT)
      assert.equal(updated.billingSubscriptionDiscountCodeKind, 'percent')
      assert.equal(Number(updated.billingSubscriptionDiscountCodeValue), 15)
      assert.equal(updated.billingSubscriptionDiscountCodeBenefitPeriods, 3)
      assert.equal(updated.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 1)
    } finally {
      await cleanup(businessUnit.businessUnitId, [planOldId, planNewId])
    }
  })

  test('CA-2: el cobro siguiente cuadra — undiscounted_subtotal - code_discount_amount = contracted_subtotal', async ({
    assert,
  }) => {
    const stamp = `${Date.now()}-2`
    const planOldId = await createPublishedPlan(79, Date.now() + 2)
    const planNewId = await createPublishedPlan(95, Date.now() + 3)
    const businessUnit = await createBusinessUnit(stamp)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await createLiveSubscription(businessUnit, planOldId, {
        contractedEmployees: 120,
        code: { kind: 'percent', value: 15 },
        benefitPeriods: 3,
        benefitPeriodsUsed: 1,
      })

      const updated = await service.changePlan(subscription.billingSubscriptionId, planNewId)

      // Identidad que exige el eslabón 7 (regla 3): las cuatro cifras cuadran
      // en la misma operación, por eso el cobro siguiente no se rechaza.
      const undiscountedSubtotal = Number(updated.billingSubscriptionUndiscountedSubtotal)
      const codeDiscountAmount = Number(updated.billingSubscriptionCodeDiscountAmount)
      const contractedSubtotal = Number(updated.billingSubscriptionContractedSubtotal)
      assert.equal(
        Math.round((undiscountedSubtotal - codeDiscountAmount) * 100) / 100,
        contractedSubtotal
      )

      // gross = 95.00 × 120 = 11400.00; volumen 10% = 1140.00 ⇒
      // undiscounted_subtotal = 10260.00; código 15% de eso = 1539.00 ⇒
      // contracted_subtotal = 8721.00; total con IVA 0.16 = 10116.36.
      const grossCents = Math.round(95.0 * 120 * 100)
      assert.equal(grossCents, 1140000)
      assert.equal(Math.round(undiscountedSubtotal * 100), 1026000)
      assert.equal(Math.round(codeDiscountAmount * 100), 153900)
      assert.equal(Math.round(contractedSubtotal * 100), 872100)
      assert.equal(Math.round(Number(updated.billingSubscriptionContractedTotal) * 100), 1011636)
    } finally {
      await cleanup(businessUnit.businessUnitId, [planOldId, planNewId])
    }
  })

  test('CA-3: fixed_amount se resta tal cual, sin escalar con el plan nuevo', async ({ assert }) => {
    const stamp = `${Date.now()}-3`
    const planOldId = await createPublishedPlan(79, Date.now() + 4)
    const planNewId = await createPublishedPlan(95, Date.now() + 5)
    const businessUnit = await createBusinessUnit(stamp)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await createLiveSubscription(businessUnit, planOldId, {
        contractedEmployees: 120,
        code: { kind: 'fixed_amount', value: 800 },
        benefitPeriods: 3,
        benefitPeriodsUsed: 1,
      })

      const updated = await service.changePlan(subscription.billingSubscriptionId, planNewId)

      assert.equal(Number(updated.billingSubscriptionUndiscountedSubtotal), 10260.0)
      assert.equal(Number(updated.billingSubscriptionCodeDiscountAmount), 800.0)
      assert.equal(Number(updated.billingSubscriptionContractedSubtotal), 9460.0)
      assert.equal(Number(updated.billingSubscriptionContractedTaxAmount), 1513.6)
      assert.equal(Number(updated.billingSubscriptionContractedTotal), 10973.6)
    } finally {
      await cleanup(businessUnit.businessUnitId, [planOldId, planNewId])
    }
  })

  test('CA-4: beneficio agotado — el trato nuevo se calcula sin código, sin borrar las condiciones', async ({
    assert,
  }) => {
    const stamp = `${Date.now()}-4`
    const planOldId = await createPublishedPlan(79, Date.now() + 6)
    const planNewId = await createPublishedPlan(95, Date.now() + 7)
    const businessUnit = await createBusinessUnit(stamp)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await createLiveSubscription(businessUnit, planOldId, {
        contractedEmployees: 120,
        code: { kind: 'percent', value: 15 },
        benefitPeriods: 3,
        benefitPeriodsUsed: 3,
      })

      const updated = await service.changePlan(subscription.billingSubscriptionId, planNewId)

      assert.equal(Number(updated.billingSubscriptionContractedSubtotal), 10260.0)
      assert.equal(Number(updated.billingSubscriptionContractedTotal), 11901.6)
      assert.equal(Number(updated.billingSubscriptionCodeDiscountAmount), 0.0)
      assert.equal(
        Number(updated.billingSubscriptionUndiscountedSubtotal),
        Number(updated.billingSubscriptionContractedSubtotal)
      )
      assert.equal(
        Number(updated.billingSubscriptionUndiscountedTotal),
        Number(updated.billingSubscriptionContractedTotal)
      )

      // Evidencia del canje: no se borra.
      assert.equal(updated.billingSubscriptionDiscountCodeText, CODE_TEXT)
      assert.equal(updated.billingSubscriptionDiscountCodeKind, 'percent')
      assert.equal(updated.billingSubscriptionDiscountCodeBenefitPeriods, 3)
      assert.equal(updated.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 3)
    } finally {
      await cleanup(businessUnit.businessUnitId, [planOldId, planNewId])
    }
  })

  test('CA-5 · ERROR: unit_price con beneficio vigente rechaza con 409 y no toca nada', async ({
    assert,
  }) => {
    const stamp = `${Date.now()}-5`
    const planOldId = await createPublishedPlan(79, Date.now() + 8)
    const planNewId = await createPublishedPlan(95, Date.now() + 9)
    const businessUnit = await createBusinessUnit(stamp)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await createLiveSubscription(businessUnit, planOldId, {
        contractedEmployees: 120,
        code: { kind: 'unit_price', value: 65 },
        benefitPeriods: 3,
        benefitPeriodsUsed: 1,
      })
      const before = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)

      let thrown: unknown
      try {
        await service.changePlan(subscription.billingSubscriptionId, planNewId)
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, BillingSubscriptionServiceError)
      const err = thrown as BillingSubscriptionServiceError
      assert.equal(err.httpStatus, 409)
      assert.equal(err.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_CHANGE_UNIT_PRICE_CODE)
      assert.equal(err.key, 'cambio-de-plan-con-precio-fijado')

      const after = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(after.billingPlanId, before.billingPlanId)
      assert.equal(
        Number(after.billingSubscriptionContractedTotal),
        Number(before.billingSubscriptionContractedTotal)
      )
      assert.equal(
        after.billingSubscriptionDiscountCodeBenefitPeriodsUsed,
        before.billingSubscriptionDiscountCodeBenefitPeriodsUsed
      )
    } finally {
      await cleanup(businessUnit.businessUnitId, [planOldId, planNewId])
    }
  })

  test('CA-6: unit_price con beneficio agotado sí pasa, recalculando sin código', async ({
    assert,
  }) => {
    const stamp = `${Date.now()}-6`
    const planOldId = await createPublishedPlan(79, Date.now() + 10)
    const planNewId = await createPublishedPlan(95, Date.now() + 11)
    const businessUnit = await createBusinessUnit(stamp)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await createLiveSubscription(businessUnit, planOldId, {
        contractedEmployees: 120,
        code: { kind: 'unit_price', value: 65 },
        benefitPeriods: 3,
        benefitPeriodsUsed: 3,
      })

      const updated = await service.changePlan(subscription.billingSubscriptionId, planNewId)

      assert.equal(Number(updated.billingSubscriptionContractedUnitAmount), 95.0)
      assert.equal(Number(updated.billingSubscriptionCodeDiscountAmount), 0.0)
      assert.equal(updated.billingSubscriptionDiscountCodeKind, 'unit_price')
      assert.equal(updated.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 3)
    } finally {
      await cleanup(businessUnit.businessUnitId, [planOldId, planNewId])
    }
  })

  test('CA-7 · ERROR: suscripción cancelada rechaza antes de la comprobación de unit_price', async ({
    assert,
  }) => {
    const stamp = `${Date.now()}-7`
    const planOldId = await createPublishedPlan(79, Date.now() + 12)
    const planNewId = await createPublishedPlan(95, Date.now() + 13)
    const businessUnit = await createBusinessUnit(stamp)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await createLiveSubscription(businessUnit, planOldId, {
        contractedEmployees: 120,
        code: { kind: 'unit_price', value: 65 },
        benefitPeriods: 3,
        benefitPeriodsUsed: 1,
      })
      subscription.billingSubscriptionStatus = 'canceled'
      await subscription.save()

      let thrown: unknown
      try {
        await service.changePlan(subscription.billingSubscriptionId, planNewId)
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, BillingSubscriptionServiceError)
      const err = thrown as BillingSubscriptionServiceError
      assert.equal(err.httpStatus, 422)
      assert.equal(err.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_CANCELED)
    } finally {
      await cleanup(businessUnit.businessUnitId, [planOldId, planNewId])
    }
  })

  test('CA-8 · NO REGRESIÓN: sin código, changePlan se comporta idéntico a antes de esta HU', async ({
    assert,
  }) => {
    const stamp = `${Date.now()}-8`
    const planOldId = await createPublishedPlan(79, Date.now() + 14)
    const planNewId = await createPublishedPlan(95, Date.now() + 15)
    const businessUnit = await createBusinessUnit(stamp)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await createLiveSubscription(businessUnit, planOldId, {
        contractedEmployees: 120,
        code: null,
        benefitPeriods: null,
        benefitPeriodsUsed: 0,
      })

      const updated = await service.changePlan(subscription.billingSubscriptionId, planNewId)

      assert.equal(Number(updated.billingSubscriptionContractedUnitAmount), 95.0)
      assert.equal(Number(updated.billingSubscriptionDiscountPercent), 10.0)
      assert.equal(Number(updated.billingSubscriptionContractedSubtotal), 10260.0)
      assert.equal(Number(updated.billingSubscriptionContractedTaxAmount), 1641.6)
      assert.equal(Number(updated.billingSubscriptionContractedTotal), 11901.6)

      // Sin código: los cinco campos no se tocan (siguen NULL/0 como hoy).
      assert.isNull(updated.billingSubscriptionDiscountCodeText)
      assert.equal(Number(updated.billingSubscriptionCodeDiscountAmount), 0)
      assert.isNull(updated.billingSubscriptionUndiscountedUnitAmount)
      assert.isNull(updated.billingSubscriptionUndiscountedSubtotal)
      assert.isNull(updated.billingSubscriptionUndiscountedTaxAmount)
      assert.isNull(updated.billingSubscriptionUndiscountedTotal)
    } finally {
      await cleanup(businessUnit.businessUnitId, [planOldId, planNewId])
    }
  })
})

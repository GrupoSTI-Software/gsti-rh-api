import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import DiscountCode from '#models/discount_code'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import BillingSubscriptionChangeService from '#services/billing_subscription_change_service'
import DiscountCodeService from '#services/discount_code_service'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '#constants/billing_subscription_error_codes'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'
import { toBusinessDateString } from '#utils/business_date'

/**
 * Tests funcionales — canje y congelado del código de descuento al dar de
 * alta la suscripción (USRH1787714804401). Cubren: los tres tipos de
 * código con cuadre al centavo contra el ejemplo del spec, la no-regresión
 * sin `discountCode`, el rechazo por subtotal en cero, el rechazo por cupo
 * agotado (con y sin concurrencia), la delegación del mismo motivo que da
 * la cotización, y el candado temporal de los cambios de cupo del tenant.
 */

async function createPublishedPlan(
  stamp: number,
  priceAmount = 79
): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Discount Redeem Plan ${stamp}`,
    billingPlanDescription: 'Fixture de canje de código al contratar',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: priceAmount,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 14,
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
    billingVolumeTierMinEmployees: 101,
    billingVolumeTierDiscountPercent: 10,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: number): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Discount Redeem BU ${stamp}`
  businessUnit.businessUnitSlug = `discount-redeem-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Discount Redeem Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function createCode(
  stamp: number,
  overrides: Partial<{
    kind: 'percent' | 'fixed_amount' | 'unit_price'
    value: number
    benefitPeriods: number | null
    maxRedemptions: number | null
    redeemedCount: number
    validFrom: string | null
    validTo: string | null
    active: number
  }> = {}
): Promise<DiscountCode> {
  const code = await DiscountCode.create({
    discountCodeCode: `RDM${stamp}`,
    discountCodeName: `Redeem fixture ${stamp}`,
    discountCodeKind: overrides.kind ?? 'percent',
    discountCodeValue: overrides.value ?? 15,
    discountCodeValidFrom: overrides.validFrom ?? null,
    discountCodeValidTo: overrides.validTo ?? null,
    discountCodeMaxRedemptions: overrides.maxRedemptions ?? null,
    discountCodeRedeemedCount: overrides.redeemedCount ?? 0,
    discountCodeBenefitPeriods: overrides.benefitPeriods ?? 3,
    discountCodeActive: overrides.active ?? 1,
  })
  return code
}

async function cleanupBusinessUnit(businessUnitId: number) {
  await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

async function cleanupPlan(planId: number | null) {
  if (!planId) return
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

async function cleanupCode(codeId: number | null) {
  if (!codeId) return
  await DiscountCode.query().where('discount_code_id', codeId).delete()
}

test.group('createSubscription — canje del código (CA-1: percent, 79/emp, 120 emp, 15% x 3)', () => {
  test('congela contracted_* con descuento y undiscounted_* sin él; contador 0→1', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCode(stamp, { kind: 'percent', value: 15, benefitPeriods: 3 })
    const service = new BillingSubscriptionService()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 120,
        discountCode: code.discountCodeCode.toLowerCase(),
        skipTrial: true,
      })

      assert.equal(subscription.billingSubscriptionContractedUnitAmount, 79)
      assert.equal(subscription.billingSubscriptionContractedSubtotal, 7252.2)
      assert.equal(subscription.billingSubscriptionContractedTaxAmount, 1160.35)
      assert.equal(subscription.billingSubscriptionContractedTotal, 8412.55)
      assert.equal(subscription.billingSubscriptionDiscountPercent, 10)

      assert.equal(subscription.billingSubscriptionDiscountCodeId, code.discountCodeId)
      assert.equal(subscription.billingSubscriptionDiscountCodeText, code.discountCodeCode)
      assert.equal(subscription.billingSubscriptionDiscountCodeKind, 'percent')
      assert.equal(Number(subscription.billingSubscriptionDiscountCodeValue), 15)
      assert.equal(subscription.billingSubscriptionDiscountCodeBenefitPeriods, 3)
      assert.equal(subscription.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 0)
      assert.equal(subscription.billingSubscriptionCodeDiscountAmount, 1279.8)

      assert.equal(subscription.billingSubscriptionUndiscountedUnitAmount, 79)
      assert.equal(subscription.billingSubscriptionUndiscountedSubtotal, 8532)
      assert.equal(subscription.billingSubscriptionUndiscountedTaxAmount, 1365.12)
      assert.equal(subscription.billingSubscriptionUndiscountedTotal, 9897.12)

      const reloadedCode = await DiscountCode.findOrFail(code.discountCodeId)
      assert.equal(reloadedCode.discountCodeRedeemedCount, 1)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
      await cleanupCode(code.discountCodeId)
    }
  })

  test('unit_price sustituye el precio por empleado y conserva el de lista en undiscounted', async ({
    assert,
  }) => {
    const stamp = Date.now() + 1
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCode(stamp, { kind: 'unit_price', value: 65, benefitPeriods: 3 })
    const service = new BillingSubscriptionService()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 120,
        discountCode: code.discountCodeCode,
        skipTrial: true,
      })

      assert.equal(subscription.billingSubscriptionContractedUnitAmount, 65)
      assert.equal(subscription.billingSubscriptionUndiscountedUnitAmount, 79)
      assert.equal(subscription.billingSubscriptionContractedSubtotal, 7020)
      assert.equal(subscription.billingSubscriptionContractedTaxAmount, 1123.2)
      assert.equal(subscription.billingSubscriptionContractedTotal, 8143.2)
      assert.equal(subscription.billingSubscriptionUndiscountedSubtotal, 8532)
      assert.equal(subscription.billingSubscriptionCodeDiscountAmount, 1512)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
      await cleanupCode(code.discountCodeId)
    }
  })
})

test.group('createSubscription — [NO REGRESIÓN] sin discountCode', () => {
  test('se comporta idéntico a antes de esta historia', async ({ assert }) => {
    const stamp = Date.now() + 2
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const service = new BillingSubscriptionService()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 120,
        skipTrial: true,
      })

      assert.equal(subscription.billingSubscriptionContractedSubtotal, 8532)
      assert.equal(subscription.billingSubscriptionContractedTaxAmount, 1365.12)
      assert.equal(subscription.billingSubscriptionContractedTotal, 9897.12)

      assert.isNull(subscription.billingSubscriptionDiscountCodeId)
      assert.isNull(subscription.billingSubscriptionDiscountCodeText)
      assert.isNull(subscription.billingSubscriptionDiscountCodeKind)
      assert.isNull(subscription.billingSubscriptionDiscountCodeValue)
      assert.isNull(subscription.billingSubscriptionDiscountCodeBenefitPeriods)
      assert.equal(subscription.billingSubscriptionDiscountCodeBenefitPeriodsUsed, 0)
      assert.equal(subscription.billingSubscriptionCodeDiscountAmount, 0)
      assert.isNull(subscription.billingSubscriptionUndiscountedUnitAmount)
      assert.isNull(subscription.billingSubscriptionUndiscountedSubtotal)
      assert.isNull(subscription.billingSubscriptionUndiscountedTaxAmount)
      assert.isNull(subscription.billingSubscriptionUndiscountedTotal)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
    }
  })
})

test.group('createSubscription — [ERROR] motivos de no-redimibilidad (mismo cuerpo que la cotización)', () => {
  test('código agotado: 422 CODE_EXHAUSTED, no crea fila, contador intacto', async ({ assert }) => {
    const stamp = Date.now() + 3
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCode(stamp, { maxRedemptions: 50, redeemedCount: 50 })
    const service = new BillingSubscriptionService()

    try {
      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 120,
          discountCode: code.discountCodeCode,
        })
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      assert.equal((thrown as { httpStatus?: number }).httpStatus, 422)
      assert.equal(
        (thrown as { errorCode?: string }).errorCode,
        DISCOUNT_CODE_ERROR_CODES.CODE_EXHAUSTED
      )
      assert.equal((thrown as { key?: string }).key, 'codigo-agotado')

      const rows = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(rows, 0)

      const reloadedCode = await DiscountCode.findOrFail(code.discountCodeId)
      assert.equal(reloadedCode.discountCodeRedeemedCount, 50)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
      await cleanupCode(code.discountCodeId)
    }
  })

  test('código vencido: 422 CODE_EXPIRED con el mismo cuerpo que la cotización', async ({
    assert,
  }) => {
    const stamp = Date.now() + 4
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCode(stamp, { validTo: '2020-01-01' })
    const service = new BillingSubscriptionService()
    const catalogService = new DiscountCodeService()

    try {
      const quoteError = await catalogService
        .quoteWithDiscountCode({
          discountCodeText: code.discountCodeCode,
          billingPlanId: planId,
          employeeCount: 120,
        })
        .catch((error) => error)

      let subscriptionError: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 120,
          discountCode: code.discountCodeCode,
        })
      } catch (error) {
        subscriptionError = error
      }

      assert.isNotNull(subscriptionError)
      assert.equal(
        (subscriptionError as { httpStatus?: number }).httpStatus,
        (quoteError as { httpStatus?: number }).httpStatus
      )
      assert.equal(
        (subscriptionError as { errorCode?: string }).errorCode,
        (quoteError as { errorCode?: string }).errorCode
      )
      assert.equal(
        (subscriptionError as { key?: string }).key,
        (quoteError as { key?: string }).key
      )
      assert.equal(
        (subscriptionError as { detail?: string }).detail,
        (quoteError as { detail?: string }).detail
      )

      const rows = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(rows, 0)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
      await cleanupCode(code.discountCodeId)
    }
  })

  test('empresa con suscripción viva y código: sigue 409 ALREADY_LIVE, contador no se mueve', async ({
    assert,
  }) => {
    const stamp = Date.now() + 5
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCode(stamp)
    const service = new BillingSubscriptionService()

    try {
      await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
      })

      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          discountCode: code.discountCodeCode,
        })
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      assert.equal((thrown as { httpStatus?: number }).httpStatus, 409)
      assert.equal((thrown as { errorCode?: string }).errorCode, 'PLT.SUB.ALREADY_LIVE')

      const reloadedCode = await DiscountCode.findOrFail(code.discountCodeId)
      assert.equal(reloadedCode.discountCodeRedeemedCount, 0)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
      await cleanupCode(code.discountCodeId)
    }
  })
})

test.group('createSubscription — [ERROR §4.5] subtotal en cero', () => {
  test('rechaza con PLT.DSC.SUBTOTAL_ZERO, no crea fila y no consume cupo', async ({ assert }) => {
    const stamp = Date.now() + 6
    // 10 empleados, sin tramo por volumen aplicable: subtotal 790.00.
    const planId = await createPublishedPlan(stamp, 79)
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCode(stamp, { kind: 'fixed_amount', value: 1200 })
    const service = new BillingSubscriptionService()

    try {
      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          discountCode: code.discountCodeCode,
        })
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      assert.equal((thrown as { httpStatus?: number }).httpStatus, 422)
      assert.equal(
        (thrown as { errorCode?: string }).errorCode,
        DISCOUNT_CODE_ERROR_CODES.SUBTOTAL_ZERO
      )
      assert.equal((thrown as { key?: string }).key, 'subtotal-en-cero')

      const rows = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(rows, 0)

      const reloadedCode = await DiscountCode.findOrFail(code.discountCodeId)
      assert.equal(reloadedCode.discountCodeRedeemedCount, 0)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
      await cleanupCode(code.discountCodeId)
    }
  })
})

test.group('createSubscription — concurrencia: último canje disponible (regla 6)', () => {
  test('dos altas simultáneas con el último lugar: solo una cierra', async ({ assert }) => {
    const stamp = Date.now() + 7
    const planId = await createPublishedPlan(stamp)
    const businessUnitA = await createBusinessUnit(stamp)
    const businessUnitB = await createBusinessUnit(stamp + 1)
    const code = await createCode(stamp, { maxRedemptions: 50, redeemedCount: 49 })
    const service = new BillingSubscriptionService()

    try {
      const results = await Promise.allSettled([
        service.createSubscription({
          businessUnitPublicId: businessUnitA.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          discountCode: code.discountCodeCode,
        }),
        service.createSubscription({
          businessUnitPublicId: businessUnitB.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          discountCode: code.discountCodeCode,
        }),
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      assert.lengthOf(fulfilled, 1)
      assert.lengthOf(rejected, 1)

      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason
      assert.equal(
        (rejectionReason as { errorCode?: string }).errorCode,
        DISCOUNT_CODE_ERROR_CODES.CODE_EXHAUSTED
      )

      const reloadedCode = await DiscountCode.findOrFail(code.discountCodeId)
      assert.equal(reloadedCode.discountCodeRedeemedCount, 50)

      const rowsA = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnitA.businessUnitId
      )
      const rowsB = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnitB.businessUnitId
      )
      assert.equal(rowsA.length + rowsB.length, 1)
    } finally {
      await cleanupBusinessUnit(businessUnitA.businessUnitId)
      await cleanupBusinessUnit(businessUnitB.businessUnitId)
      await cleanupPlan(planId)
      await cleanupCode(code.discountCodeId)
    }
  })
})

// ---------------------------------------------------------------------------
// Candado temporal (§4.4, regla 16): change-preview, requestIncrease y el
// aumento en periodo de prueba quedan cerrados mientras el beneficio del
// código esté vivo. Se ejercen contra el servicio directamente (igual que
// `billing_subscription_trx.spec.ts`) para no depender del seed de roles
// del tenant, que en este entorno local tiene datos huérfanos preexistentes
// no relacionados con esta historia.
// ---------------------------------------------------------------------------

async function createLiveSubscriptionWithCode(
  businessUnit: BusinessUnit,
  planId: number,
  code: DiscountCode,
  benefitPeriodsUsed: number
): Promise<BillingSubscription> {
  const subscriptionService = new BillingSubscriptionService()
  const subscription = await subscriptionService.createSubscription({
    businessUnitPublicId: businessUnit.businessUnitPublicId,
    billingPlanId: planId,
    contractedEmployees: 10,
    discountCode: code.discountCodeCode,
    skipTrial: true,
  })

  const today = toBusinessDateString()
  subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(today).minus({ days: 10 })
  subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(today).plus({ days: 20 })
  subscription.billingSubscriptionDiscountCodeBenefitPeriodsUsed = benefitPeriodsUsed
  await subscription.save()

  return subscription
}

test.group('Candado temporal §4.4 — cambios de cupo del tenant con código vivo', (group) => {
  let planId: number | null = null

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now() + 8)
  })

  group.teardown(async () => {
    await cleanupPlan(planId)
  })

  test('previewChange: 409 con beneficio vivo, sin recalcular nada', async ({ assert }) => {
    const stamp = Date.now() + 9
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCode(stamp, { benefitPeriods: 3 })
    const changeService = new BillingSubscriptionChangeService()

    try {
      const subscription = await createLiveSubscriptionWithCode(businessUnit, planId!, code, 1)

      let thrown: unknown = null
      try {
        await changeService.previewChange(businessUnit.businessUnitId, 20)
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      assert.equal((thrown as { httpStatus?: number }).httpStatus, 409)
      assert.equal(
        (thrown as { errorCode?: string }).errorCode,
        BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_BLOCKED_BY_DISCOUNT_CODE
      )
      assert.equal((thrown as { key?: string }).key, 'cambio-bloqueado-por-codigo-de-descuento')

      const reloaded = await BillingSubscription.findOrFail(subscription.billingSubscriptionId)
      assert.equal(reloaded.billingSubscriptionContractedEmployees, 10)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupCode(code.discountCodeId)
    }
  })

  test('requestIncrease: 409 con beneficio vivo, no crea billing_subscription_changes', async ({
    assert,
  }) => {
    const stamp = Date.now() + 10
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCode(stamp, { benefitPeriods: 3 })
    const changeService = new BillingSubscriptionChangeService()

    try {
      await createLiveSubscriptionWithCode(businessUnit, planId!, code, 0)

      let thrown: unknown = null
      try {
        await changeService.requestIncrease(businessUnit.businessUnitId, 20)
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      assert.equal((thrown as { httpStatus?: number }).httpStatus, 409)
      assert.equal(
        (thrown as { errorCode?: string }).errorCode,
        BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_BLOCKED_BY_DISCOUNT_CODE
      )

      const changes = await BillingSubscriptionChange.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(changes, 0)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupCode(code.discountCodeId)
    }
  })

  test('con el beneficio agotado, previewChange se comporta igual que hoy (sin candado)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 11
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCode(stamp, { benefitPeriods: 3 })
    const changeService = new BillingSubscriptionChangeService()

    try {
      // benefitPeriodsUsed === benefitPeriods: beneficio agotado, el candado no aplica.
      await createLiveSubscriptionWithCode(businessUnit, planId!, code, 3)

      const preview = await changeService.previewChange(businessUnit.businessUnitId, 20)
      assert.equal(preview.changeType, 'increase')
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupCode(code.discountCodeId)
    }
  })

  test('sin código, previewChange se comporta igual que hoy', async ({ assert }) => {
    const stamp = Date.now() + 12
    const businessUnit = await createBusinessUnit(stamp)
    const subscriptionService = new BillingSubscriptionService()
    const changeService = new BillingSubscriptionChangeService()

    try {
      await subscriptionService.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId!,
        contractedEmployees: 10,
        skipTrial: true,
      })
      const subscription = await BillingSubscription.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .firstOrFail()
      const today = toBusinessDateString()
      subscription.billingSubscriptionCurrentPeriodStart = DateTime.fromISO(today).minus({
        days: 10,
      })
      subscription.billingSubscriptionCurrentPeriodEnd = DateTime.fromISO(today).plus({ days: 20 })
      await subscription.save()

      const preview = await changeService.previewChange(businessUnit.businessUnitId, 20)
      assert.equal(preview.changeType, 'increase')
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
    }
  })
})

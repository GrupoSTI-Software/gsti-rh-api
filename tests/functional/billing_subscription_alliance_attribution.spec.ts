import { test } from '@japa/runner'
import Alliance from '#models/alliance'
import AllianceAttribution from '#models/alliance_attribution'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionChange from '#models/billing_subscription_change'
import BillingVolumeTier from '#models/billing_volume_tier'
import BusinessUnit from '#models/business_unit'
import DiscountCode from '#models/discount_code'
import { ALLIANCE_ERROR_CODES, ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import { DiscountCodeServiceError } from '#exceptions/discount_code_service_error'
import AllianceAttributionService from '#services/alliance_attribution_service'
import AllianceService from '#services/alliance_service'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'

/**
 * Contratar con el código de una alianza crea la atribución en el mismo
 * acto. Si la empresa ya le corresponde a otra, el alta se rechaza entero.
 */

async function createPublishedPlan(stamp: number, priceAmount = 79): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Alliance Redeem Plan ${stamp}`,
    billingPlanDescription: 'Fixture de atribución al canjear código de alianza',
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

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function createBusinessUnit(stamp: number): Promise<BusinessUnit> {
  return BusinessUnit.create({
    businessUnitName: `Alliance Redeem BU ${stamp}`,
    businessUnitSlug: `alliance-redeem-bu-${stamp}`,
    businessUnitLegalName: `Alliance Redeem Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createAllianceWithCode(
  stamp: number,
  params: {
    name: string
    percent: number
    term: number | null
    codeValue?: number
  }
): Promise<{ alliance: Alliance; code: DiscountCode }> {
  const alliance = await Alliance.create({
    allianceName: `${params.name} ${stamp}`,
    allianceContactName: null,
    allianceContactEmail: null,
    allianceContactPhone: null,
    allianceDefaultCommissionPercent: params.percent,
    allianceDefaultTermPeriods: params.term,
    allianceActive: 1,
  })

  const code = await DiscountCode.create({
    discountCodeCode: `ALR${stamp}`,
    discountCodeName: `Código ${params.name} ${stamp}`,
    discountCodeKind: 'percent',
    discountCodeValue: params.codeValue ?? 0,
    discountCodeValidFrom: null,
    discountCodeValidTo: null,
    discountCodeMaxRedemptions: null,
    discountCodeRedeemedCount: 0,
    discountCodeBenefitPeriods: null,
    discountCodeActive: 1,
    allianceId: alliance.allianceId,
  })

  return { alliance, code }
}

async function createCatalogCode(stamp: number, value = 15): Promise<DiscountCode> {
  return DiscountCode.create({
    discountCodeCode: `CAT${stamp}`,
    discountCodeName: `Catálogo ${stamp}`,
    discountCodeKind: 'percent',
    discountCodeValue: value,
    discountCodeValidFrom: null,
    discountCodeValidTo: null,
    discountCodeMaxRedemptions: null,
    discountCodeRedeemedCount: 0,
    discountCodeBenefitPeriods: 3,
    discountCodeActive: 1,
    allianceId: null,
  })
}

async function liveAttributions(businessUnitId: number): Promise<AllianceAttribution[]> {
  return AllianceAttribution.query()
    .where('business_unit_id', businessUnitId)
    .whereNull('alliance_attribution_closed_at')
}

async function cleanupPlan(planId: number | null) {
  if (!planId) return
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

async function cleanupScene(params: {
  businessUnitId?: number
  planId?: number | null
  allianceIds?: number[]
  codeIds?: number[]
}) {
  if (params.businessUnitId) {
    await AllianceAttribution.query().where('business_unit_id', params.businessUnitId).delete()
    await BillingSubscriptionChange.query().where('business_unit_id', params.businessUnitId).delete()
    await BillingSubscription.query().where('business_unit_id', params.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', params.businessUnitId).delete()
  }
  if (params.codeIds && params.codeIds.length > 0) {
    await DiscountCode.query().whereIn('discount_code_id', params.codeIds).delete()
  }
  if (params.allianceIds && params.allianceIds.length > 0) {
    await Alliance.query().whereIn('alliance_id', params.allianceIds).delete()
  }
  await cleanupPlan(params.planId ?? null)
}

test.group('createSubscription — código de alianza atribuye en el mismo acto', () => {
  test('sin atribución previa: nace la suscripción y la atribución con el acuerdo general', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const { alliance, code } = await createAllianceWithCode(stamp, {
      name: 'Despacho Norte',
      percent: 10,
      term: 12,
      codeValue: 10,
    })
    const service = new BillingSubscriptionService()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        discountCode: code.discountCodeCode.toLowerCase(),
        skipTrial: true,
      })

      assert.exists(subscription.billingSubscriptionId)
      assert.equal(subscription.billingSubscriptionDiscountCodeId, code.discountCodeId)

      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 1)
      assert.equal(live[0].allianceId, alliance.allianceId)
      assert.equal(Number(live[0].allianceAttributionCommissionPercent), 10)
      assert.equal(live[0].allianceAttributionTermPeriods, 12)
      assert.equal(toCalendarIsoDate(live[0].allianceAttributionStartsAt), toBusinessDateString())
      assert.isNull(live[0].allianceAttributionClosedAt)

      const reloadedCode = await DiscountCode.findOrFail(code.discountCodeId)
      assert.equal(reloadedCode.discountCodeRedeemedCount, 1)
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [alliance.allianceId],
        codeIds: [code.discountCodeId],
      })
    }
  })

  test('código sin dueño: contrata igual y no crea atribución', async ({ assert }) => {
    const stamp = Date.now() + 1
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const code = await createCatalogCode(stamp)
    const service = new BillingSubscriptionService()

    try {
      await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        discountCode: code.discountCodeCode,
        skipTrial: true,
      })

      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 0)
      const all = await AllianceAttribution.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(all, 0)
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        codeIds: [code.discountCodeId],
      })
    }
  })

  test('código de alianza con descuento en cero atribuye igual y no cambia el precio', async ({
    assert,
  }) => {
    const stamp = Date.now() + 2
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const { alliance, code } = await createAllianceWithCode(stamp, {
      name: 'Alianza cero',
      percent: 15,
      term: null,
      codeValue: 0,
    })
    const service = new BillingSubscriptionService()

    try {
      const withoutCode = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        skipTrial: true,
      })
      await service.cancel(withoutCode.billingSubscriptionId)

      const withCode = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        discountCode: code.discountCodeCode,
        skipTrial: true,
      })

      assert.equal(
        withCode.billingSubscriptionContractedSubtotal,
        withoutCode.billingSubscriptionContractedSubtotal
      )
      assert.equal(Number(withCode.billingSubscriptionCodeDiscountAmount), 0)

      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 1)
      assert.equal(live[0].allianceId, alliance.allianceId)
      assert.equal(Number(live[0].allianceAttributionCommissionPercent), 15)
      assert.isNull(live[0].allianceAttributionTermPeriods)
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [alliance.allianceId],
        codeIds: [code.discountCodeId],
      })
    }
  })

  test('misma alianza viva: el alta procede y no toca porcentaje, plazo ni fecha', async ({
    assert,
  }) => {
    const stamp = Date.now() + 3
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const { alliance, code } = await createAllianceWithCode(stamp, {
      name: 'Despacho Norte',
      percent: 10,
      term: 12,
      codeValue: 10,
    })
    const attributions = new AllianceAttributionService()
    const service = new BillingSubscriptionService()
    const originalStartsAt = '2024-03-01'

    try {
      const existing = await attributions.createAttribution({
        allianceId: alliance.allianceId,
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        allianceAttributionStartsAt: originalStartsAt,
        allianceAttributionCommissionPercent: 8,
        allianceAttributionTermPeriods: 6,
      })

      await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        discountCode: code.discountCodeCode,
        skipTrial: true,
      })

      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 1)
      assert.equal(live[0].allianceAttributionId, existing.allianceAttributionId)
      assert.equal(Number(live[0].allianceAttributionCommissionPercent), 8)
      assert.equal(live[0].allianceAttributionTermPeriods, 6)
      assert.equal(toCalendarIsoDate(live[0].allianceAttributionStartsAt), originalStartsAt)
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [alliance.allianceId],
        codeIds: [code.discountCodeId],
      })
    }
  })
})

test.group('createSubscription — código de otra alianza rechaza el alta entero', () => {
  test('otra alianza viva: 422, no crea suscripción, no consume canje, no toca la atribución', async ({
    assert,
  }) => {
    const stamp = Date.now() + 10
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const norte = await createAllianceWithCode(stamp, {
      name: 'Despacho Norte',
      percent: 10,
      term: 12,
    })
    const sur = await createAllianceWithCode(stamp + 1, {
      name: 'Consultora Sur',
      percent: 20,
      term: 6,
      codeValue: 5,
    })
    const attributions = new AllianceAttributionService()
    const service = new BillingSubscriptionService()

    try {
      const existing = await attributions.createAttribution({
        allianceId: norte.alliance.allianceId,
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
        allianceAttributionCommissionPercent: 8,
      })

      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          discountCode: sur.code.discountCodeCode,
          skipTrial: true,
        })
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, AllianceServiceError)
      const allianceError = thrown as AllianceServiceError
      assert.equal(allianceError.errorCode, ALLIANCE_ERROR_CODES.ATTRIBUTION_OTHER_ALLIANCE)
      assert.equal(allianceError.httpStatus, 422)
      assert.equal(allianceError.detail, ALLIANCE_ERRORS.ATTRIBUTION_OTHER_ALLIANCE.detail)
      assert.notInclude(allianceError.detail, norte.alliance.allianceName)
      assert.notInclude(allianceError.detail, sur.alliance.allianceName)

      const subscriptions = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(subscriptions, 0)

      const reloadedCode = await DiscountCode.findOrFail(sur.code.discountCodeId)
      assert.equal(reloadedCode.discountCodeRedeemedCount, 0)

      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 1)
      assert.equal(live[0].allianceAttributionId, existing.allianceAttributionId)
      assert.equal(Number(live[0].allianceAttributionCommissionPercent), 8)
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [norte.alliance.allianceId, sur.alliance.allianceId],
        codeIds: [norte.code.discountCodeId, sur.code.discountCodeId],
      })
    }
  })

  test('atribución con plazo ya corrido sigue viva y bloquea el código ajeno', async ({
    assert,
  }) => {
    const stamp = Date.now() + 11
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const norte = await createAllianceWithCode(stamp, {
      name: 'Despacho Norte',
      percent: 10,
      term: 1,
    })
    const sur = await createAllianceWithCode(stamp + 1, {
      name: 'Consultora Sur',
      percent: 20,
      term: 6,
    })
    const attributions = new AllianceAttributionService()
    const service = new BillingSubscriptionService()

    try {
      await attributions.createAttribution({
        allianceId: norte.alliance.allianceId,
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        allianceAttributionStartsAt: '2020-01-15',
        allianceAttributionTermPeriods: 1,
      })

      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          discountCode: sur.code.discountCodeCode,
          skipTrial: true,
        })
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, AllianceServiceError)
      assert.equal(
        (thrown as AllianceServiceError).errorCode,
        ALLIANCE_ERROR_CODES.ATTRIBUTION_OTHER_ALLIANCE
      )

      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 1)
      assert.equal(live[0].allianceId, norte.alliance.allianceId)
      assert.equal(toCalendarIsoDate(live[0].allianceAttributionStartsAt), '2020-01-15')
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [norte.alliance.allianceId, sur.alliance.allianceId],
        codeIds: [norte.code.discountCodeId, sur.code.discountCodeId],
      })
    }
  })

  test('reemplazo de suscripción viva: el rechazo deja la viva intacta', async ({ assert }) => {
    const stamp = Date.now() + 12
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const norte = await createAllianceWithCode(stamp, {
      name: 'Despacho Norte',
      percent: 10,
      term: 12,
    })
    const sur = await createAllianceWithCode(stamp + 1, {
      name: 'Consultora Sur',
      percent: 20,
      term: 6,
    })
    const attributions = new AllianceAttributionService()
    const service = new BillingSubscriptionService()

    try {
      const original = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        skipTrial: true,
      })
      await attributions.createAttribution({
        allianceId: norte.alliance.allianceId,
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })

      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 20,
          discountCode: sur.code.discountCodeCode,
          replaceLiveSubscription: true,
          skipTrial: true,
        })
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, AllianceServiceError)
      assert.equal(
        (thrown as AllianceServiceError).errorCode,
        ALLIANCE_ERROR_CODES.ATTRIBUTION_OTHER_ALLIANCE
      )

      const reloaded = await BillingSubscription.findOrFail(original.billingSubscriptionId)
      assert.equal(reloaded.billingSubscriptionStatus, 'active')
      assert.equal(reloaded.billingSubscriptionLiveBusinessUnitId, businessUnit.businessUnitId)

      const allSubs = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(allSubs, 1)

      const reloadedCode = await DiscountCode.findOrFail(sur.code.discountCodeId)
      assert.equal(reloadedCode.discountCodeRedeemedCount, 0)
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [norte.alliance.allianceId, sur.alliance.allianceId],
        codeIds: [norte.code.discountCodeId, sur.code.discountCodeId],
      })
    }
  })

  test('recontratación tras cancelar: la atribución de la empresa sigue bloqueando el código ajeno', async ({
    assert,
  }) => {
    const stamp = Date.now() + 13
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const norte = await createAllianceWithCode(stamp, {
      name: 'Despacho Norte',
      percent: 10,
      term: 12,
    })
    const sur = await createAllianceWithCode(stamp + 1, {
      name: 'Consultora Sur',
      percent: 20,
      term: 6,
    })
    const attributions = new AllianceAttributionService()
    const service = new BillingSubscriptionService()

    try {
      const original = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        skipTrial: true,
      })
      await attributions.createAttribution({
        allianceId: norte.alliance.allianceId,
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
      await service.cancel(original.billingSubscriptionId)

      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          discountCode: sur.code.discountCodeCode,
          skipTrial: true,
        })
      } catch (error) {
        thrown = error
      }

      assert.instanceOf(thrown, AllianceServiceError)
      assert.equal(
        (thrown as AllianceServiceError).errorCode,
        ALLIANCE_ERROR_CODES.ATTRIBUTION_OTHER_ALLIANCE
      )

      const liveSubs = await BillingSubscription.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .whereIn('billing_subscription_status', ['trialing', 'active', 'past_due'])
      assert.lengthOf(liveSubs, 0)

      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 1)
      assert.equal(live[0].allianceId, norte.alliance.allianceId)
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [norte.alliance.allianceId, sur.alliance.allianceId],
        codeIds: [norte.code.discountCodeId, sur.code.discountCodeId],
      })
    }
  })

  test('tras cerrar la atribución, el código de otra alianza sí atribuye', async ({ assert }) => {
    const stamp = Date.now() + 14
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const norte = await createAllianceWithCode(stamp, {
      name: 'Despacho Norte',
      percent: 10,
      term: 12,
    })
    const sur = await createAllianceWithCode(stamp + 1, {
      name: 'Consultora Sur',
      percent: 20,
      term: 6,
    })
    const attributions = new AllianceAttributionService()
    const service = new BillingSubscriptionService()

    try {
      const existing = await attributions.createAttribution({
        allianceId: norte.alliance.allianceId,
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        allianceAttributionStartsAt: toBusinessDateString(),
      })
      await attributions.closeAllianceAttribution(existing.allianceAttributionId, {
        allianceAttributionClosedAt: toBusinessDateString(),
        allianceAttributionCloseReason: 'Cambio deliberado de alianza',
      })

      await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        discountCode: sur.code.discountCodeCode,
        skipTrial: true,
      })

      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 1)
      assert.equal(live[0].allianceId, sur.alliance.allianceId)
      assert.equal(Number(live[0].allianceAttributionCommissionPercent), 20)
      assert.equal(live[0].allianceAttributionTermPeriods, 6)
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [norte.alliance.allianceId, sur.alliance.allianceId],
        codeIds: [norte.code.discountCodeId, sur.code.discountCodeId],
      })
    }
  })
})

test.group('createSubscription — carreras de atribución al canjear', () => {
  test('ligar a mano y contratar con el mismo código dejan una sola atribución viva', async ({
    assert,
  }) => {
    const stamp = Date.now() + 20
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const { alliance, code } = await createAllianceWithCode(stamp, {
      name: 'Despacho Norte',
      percent: 10,
      term: 12,
    })
    const attributions = new AllianceAttributionService()
    const service = new BillingSubscriptionService()

    try {
      const [manual, contract] = await Promise.allSettled([
        attributions.createAttribution({
          allianceId: alliance.allianceId,
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          allianceAttributionStartsAt: toBusinessDateString(),
        }),
        service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          discountCode: code.discountCodeCode,
          skipTrial: true,
        }),
      ])

      const unexpected = [manual, contract].filter((result) => {
        if (result.status === 'fulfilled') return false
        const error = result.reason
        return !(
          error instanceof AllianceServiceError &&
          error.errorCode === ALLIANCE_ERROR_CODES.ATTRIBUTION_ALREADY_LIVE
        )
      })
      assert.lengthOf(unexpected, 0)

      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 1)
      assert.equal(live[0].allianceId, alliance.allianceId)

      if (contract.status === 'fulfilled') {
        assert.exists(contract.value.billingSubscriptionId)
      }
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [alliance.allianceId],
        codeIds: [code.discountCodeId],
      })
    }
  })

  test('desactivar la alianza y contratar con su código no revienta: o atribuye o rechaza el canje', async ({
    assert,
  }) => {
    const stamp = Date.now() + 21
    const planId = await createPublishedPlan(stamp)
    const businessUnit = await createBusinessUnit(stamp)
    const { alliance, code } = await createAllianceWithCode(stamp, {
      name: 'Alianza a desactivar',
      percent: 10,
      term: 12,
    })
    const alliances = new AllianceService()
    const service = new BillingSubscriptionService()

    try {
      const [deactivated, contracted] = await Promise.allSettled([
        alliances.deactivateAlliance(alliance.allianceId),
        service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: planId,
          contractedEmployees: 10,
          discountCode: code.discountCodeCode,
          skipTrial: true,
        }),
      ])

      if (deactivated.status === 'rejected') {
        assert.fail(`desactivar no debió fallar: ${(deactivated.reason as Error).message}`)
      }

      if (contracted.status === 'fulfilled') {
        const live = await liveAttributions(businessUnit.businessUnitId)
        assert.lengthOf(live, 1)
        assert.equal(live[0].allianceId, alliance.allianceId)
        return
      }

      const error = contracted.reason
      const isInactiveCode =
        error instanceof DiscountCodeServiceError &&
        error.errorCode === DISCOUNT_CODE_ERROR_CODES.CODE_INACTIVE
      const isInactiveAlliance =
        error instanceof AllianceServiceError && error.errorCode === ALLIANCE_ERROR_CODES.INACTIVE
      assert.isTrue(isInactiveCode || isInactiveAlliance)

      const subscriptions = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(subscriptions, 0)
      const live = await liveAttributions(businessUnit.businessUnitId)
      assert.lengthOf(live, 0)
    } finally {
      await cleanupScene({
        businessUnitId: businessUnit.businessUnitId,
        planId,
        allianceIds: [alliance.allianceId],
        codeIds: [code.discountCodeId],
      })
    }
  })
})

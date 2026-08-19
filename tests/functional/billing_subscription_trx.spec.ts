import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Billing Trx Plan ${stamp}`,
    billingPlanDescription: 'Fixture de createSubscription(trx)',
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

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

async function cleanupBusinessUnit(businessUnitId: number) {
  await BillingSubscription.query().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

async function cleanupPlan(planId: number) {
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) {
    await plan.delete()
  }
}

test.group('BillingSubscriptionService.createSubscription — trx compartida (CA-9, CA-10)', () => {
  test('sin trx crea la suscripción con transacción propia', async ({ assert }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Landlord Trx BU ${stamp}`
    businessUnit.businessUnitSlug = `landlord-trx-bu-${stamp}`
    businessUnit.businessUnitLegalName = `Landlord Trx Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    await businessUnit.save()

    const service = new BillingSubscriptionService()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 30,
      })

      assert.equal(subscription.billingSubscriptionStatus, 'trialing')
      assert.equal(subscription.billingSubscriptionContractedEmployees, 30)

      const persisted = await BillingSubscription.find(subscription.billingSubscriptionId)
      assert.isNotNull(persisted)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
    }
  })

  test('con trx del llamador participa en el rollback externo', async ({ assert }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const service = new BillingSubscriptionService()
    let businessUnitId: number | null = null

    try {
      await db.transaction(async (trx) => {
        const businessUnit = new BusinessUnit()
        businessUnit.businessUnitName = `Shared Trx BU ${stamp}`
        businessUnit.businessUnitSlug = `shared-trx-bu-${stamp}`
        businessUnit.businessUnitLegalName = `Shared Trx Legal ${stamp}`
        businessUnit.businessUnitActive = 1
        businessUnit.useTransaction(trx)
        await businessUnit.save()
        businessUnitId = businessUnit.businessUnitId

        await service.createSubscription(
          {
            businessUnitPublicId: businessUnit.businessUnitPublicId,
            billingPlanId: planId,
            contractedEmployees: 20,
          },
          trx
        )

        throw new Error('rollback-intencional')
      })
      assert.fail('debió abortar la transacción')
    } catch (error) {
      assert.equal((error as Error).message, 'rollback-intencional')
    }

    const subscriptions = await BillingSubscription.query().where('business_unit_id', businessUnitId!)
    assert.lengthOf(subscriptions, 0)

    const businessUnit = await BusinessUnit.find(businessUnitId!)
    assert.isNull(businessUnit)

    await cleanupPlan(planId)
  })
})

test.group('BillingSubscriptionService.createSubscription — skipTrial (USRH1785441822058)', () => {
  test('sin skipTrial nace en trialing con fin de prueba del catálogo', async ({ assert }) => {
    const stamp = Date.now()
    const planId = await createPublishedPlan(stamp)
    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Skip Trial Default BU ${stamp}`
    businessUnit.businessUnitSlug = `skip-trial-default-bu-${stamp}`
    businessUnit.businessUnitLegalName = `Skip Trial Default Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    await businessUnit.save()

    const service = new BillingSubscriptionService()
    const today = toBusinessDateString()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 20,
      })

      assert.equal(subscription.billingSubscriptionStatus, 'trialing')
      assert.equal(subscription.billingSubscriptionContractedTrialDays, 7)
      assert.isNotNull(subscription.billingSubscriptionTrialEndsAt)
      assert.equal(
        toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd),
        toCalendarIsoDate(subscription.billingSubscriptionTrialEndsAt)
      )
      assert.notEqual(toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd), today)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
    }
  })

  test('con skipTrial nace active sin prueba y periodo cubierto hasta hoy', async ({ assert }) => {
    const stamp = Date.now() + 1
    const planId = await createPublishedPlan(stamp)
    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Skip Trial Active BU ${stamp}`
    businessUnit.businessUnitSlug = `skip-trial-active-bu-${stamp}`
    businessUnit.businessUnitLegalName = `Skip Trial Active Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    await businessUnit.save()

    const service = new BillingSubscriptionService()
    const today = toBusinessDateString()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 20,
        skipTrial: true,
      })

      assert.equal(subscription.billingSubscriptionStatus, 'active')
      assert.equal(subscription.billingSubscriptionContractedTrialDays, 0)
      assert.isNull(subscription.billingSubscriptionTrialEndsAt)
      assert.equal(toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd), today)
      assert.isAbove(subscription.billingSubscriptionContractedSubtotal, 0)
      assert.isAbove(subscription.billingSubscriptionContractedTotal, 0)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
    }
  })
})

test.group('BillingSubscriptionService.createSubscription — replaceLiveSubscription (USRH1785962095087)', () => {
  test('Criterio 1 — reemplazo feliz: cancela la viva y crea la nueva en un solo acto', async ({
    assert,
  }) => {
    const stamp = Date.now() + 2
    const planId = await createPublishedPlan(stamp)
    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Replace Happy BU ${stamp}`
    businessUnit.businessUnitSlug = `replace-happy-bu-${stamp}`
    businessUnit.businessUnitLegalName = `Replace Happy Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    await businessUnit.save()

    const service = new BillingSubscriptionService()
    const today = toBusinessDateString()

    try {
      const original = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
      })
      assert.equal(original.billingSubscriptionStatus, 'trialing')

      const replacement = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 20,
        replaceLiveSubscription: true,
      })

      assert.notEqual(replacement.billingSubscriptionId, original.billingSubscriptionId)
      // La original ya gozó prueba (contracted_trial_days > 0): el reemplazo
      // nace sin prueba, active (regla de prueba única por empresa).
      assert.equal(replacement.billingSubscriptionStatus, 'active')
      assert.equal(replacement.billingSubscriptionContractedEmployees, 20)

      const reloadedOriginal = await BillingSubscription.find(original.billingSubscriptionId)
      assert.equal(reloadedOriginal!.billingSubscriptionStatus, 'canceled')
      assert.equal(toCalendarIsoDate(reloadedOriginal!.billingSubscriptionCanceledAt), today)
      assert.isNull(reloadedOriginal!.billingSubscriptionLiveBusinessUnitId)

      const liveRows = await BillingSubscription.query()
        .where('business_unit_id', businessUnit.businessUnitId)
        .whereIn('billing_subscription_status', ['trialing', 'active', 'past_due'])
      assert.lengthOf(liveRows, 1)
      assert.equal(liveRows[0].billingSubscriptionId, replacement.billingSubscriptionId)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
    }
  })

  test('Criterio 2 — sin la instrucción, sigue rechazando con ALREADY_LIVE (regresión)', async ({
    assert,
  }) => {
    const stamp = Date.now() + 3
    const planId = await createPublishedPlan(stamp)
    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Replace Regression BU ${stamp}`
    businessUnit.businessUnitSlug = `replace-regression-bu-${stamp}`
    businessUnit.businessUnitLegalName = `Replace Regression Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    await businessUnit.save()

    const service = new BillingSubscriptionService()

    try {
      const original = await service.createSubscription({
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
        })
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      assert.equal((thrown as { httpStatus?: number }).httpStatus, 409)
      assert.equal((thrown as { errorCode?: string }).errorCode, 'PLT.SUB.ALREADY_LIVE')

      const reloadedOriginal = await BillingSubscription.find(original.billingSubscriptionId)
      assert.equal(reloadedOriginal!.billingSubscriptionStatus, 'trialing')
      assert.isNull(reloadedOriginal!.billingSubscriptionCanceledAt)
      assert.equal(reloadedOriginal!.billingSubscriptionLiveBusinessUnitId, businessUnit.businessUnitId)

      const allRows = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(allRows, 1)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
    }
  })

  test('Criterio 3 — todo-o-nada: si falla el alta nueva, la original sigue viva sin cambios', async ({
    assert,
  }) => {
    const stamp = Date.now() + 4
    const planId = await createPublishedPlan(stamp)
    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Replace Rollback BU ${stamp}`
    businessUnit.businessUnitSlug = `replace-rollback-bu-${stamp}`
    businessUnit.businessUnitLegalName = `Replace Rollback Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    await businessUnit.save()

    const service = new BillingSubscriptionService()

    try {
      const original = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
      })

      // Un plan sin precio vigente (nunca publicado) hace fallar resolvePrice
      // antes de llegar al bloque de creación — el reemplazo debe abortar
      // sin cancelar la original.
      const unpublished = await new BillingCatalogService().createPlan({
        billingPlanName: `Replace Rollback Plan ${stamp}`,
        billingPlanDescription: 'Fixture sin publicar',
        billingPlanProvider: 'manual',
      })

      let thrown: unknown = null
      try {
        await service.createSubscription({
          businessUnitPublicId: businessUnit.businessUnitPublicId,
          billingPlanId: unpublished.billingPlanId,
          contractedEmployees: 10,
          replaceLiveSubscription: true,
        })
      } catch (error) {
        thrown = error
      }

      assert.isNotNull(thrown)
      assert.equal((thrown as { httpStatus?: number }).httpStatus, 422)

      const reloadedOriginal = await BillingSubscription.find(original.billingSubscriptionId)
      assert.equal(reloadedOriginal!.billingSubscriptionStatus, 'trialing')
      assert.isNull(reloadedOriginal!.billingSubscriptionCanceledAt)
      assert.equal(reloadedOriginal!.billingSubscriptionLiveBusinessUnitId, businessUnit.businessUnitId)

      const allRows = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(allRows, 1)

      await BillingPlan.query().where('billing_plan_id', unpublished.billingPlanId).delete()
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
    }
  })

  test('Criterio 4 — la instrucción sin contratación viva es inocua: alta normal', async ({
    assert,
  }) => {
    const stamp = Date.now() + 5
    const planId = await createPublishedPlan(stamp)
    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Replace Noop BU ${stamp}`
    businessUnit.businessUnitSlug = `replace-noop-bu-${stamp}`
    businessUnit.businessUnitLegalName = `Replace Noop Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    await businessUnit.save()

    const service = new BillingSubscriptionService()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
        replaceLiveSubscription: true,
      })

      assert.equal(subscription.billingSubscriptionStatus, 'trialing')

      const allRows = await BillingSubscription.query().where(
        'business_unit_id',
        businessUnit.businessUnitId
      )
      assert.lengthOf(allRows, 1)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
    }
  })

  test('regresión de cancel(): sigue devolviendo 422 si ya estaba cancelada', async ({ assert }) => {
    const stamp = Date.now() + 6
    const planId = await createPublishedPlan(stamp)
    const businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Cancel Regression BU ${stamp}`
    businessUnit.businessUnitSlug = `cancel-regression-bu-${stamp}`
    businessUnit.businessUnitLegalName = `Cancel Regression Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    await businessUnit.save()

    const service = new BillingSubscriptionService()

    try {
      const subscription = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: planId,
        contractedEmployees: 10,
      })

      const canceled = await service.cancel(subscription.billingSubscriptionId)
      assert.equal(canceled.billingSubscriptionStatus, 'canceled')

      let thrown: unknown = null
      try {
        await service.cancel(subscription.billingSubscriptionId)
      } catch (error) {
        thrown = error
      }
      assert.isNotNull(thrown)
      assert.equal((thrown as { httpStatus?: number }).httpStatus, 422)
      assert.equal((thrown as { errorCode?: string }).errorCode, 'PLT.SUB.SUBSCRIPTION_CANCELED')
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(planId)
    }
  })
})

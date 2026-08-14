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

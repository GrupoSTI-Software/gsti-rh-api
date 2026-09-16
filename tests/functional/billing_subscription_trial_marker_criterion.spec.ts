import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'

/**
 * USRH1789151097443 — "¿esta empresa tuvo prueba?" en el alta de una
 * suscripción nueva (`hasConsumedTrial`) debe decidirse por
 * `billing_subscription_trial_ends_at` (se escribe una sola vez, al dar de
 * alta, y ninguna operación lo vuelve a tocar) y NUNCA por
 * `billing_subscription_contracted_trial_days` (se reescribe en cada
 * `changePlan()`, describe el plan vigente, no la historia de la empresa).
 *
 * Comprobación en los dos sentidos que pide el spec:
 * - RN-04 (deja de negar): empresa que entró sin prueba y solo cambió de
 *   plan → al dar de alta una suscripción nueva SÍ recibe su prueba.
 * - RN-03 (caso legítimo, no se rompe): empresa que sí tuvo prueba → al dar
 *   de alta otra suscripción sigue sin prueba, aunque la suscripción con la
 *   que la gozó ya no esté vigente.
 */

async function createPlan(stamp: number, trialDays: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Trial Marker Plan ${trialDays}d ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1789151097443',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: trialDays,
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

async function createBusinessUnit(stamp: number, tag: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Trial Marker ${tag} BU ${stamp}`
  businessUnit.businessUnitSlug = `trial-marker-${tag}-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Trial Marker ${tag} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function cleanupBusinessUnit(businessUnitId: number): Promise<void> {
  await BillingSubscription.query().withTrashed().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

async function cleanupPlan(planId: number): Promise<void> {
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

test.group('BillingSubscriptionService.createSubscription — criterio de prueba consumida (USRH1789151097443)', () => {
  test('RN-04: empresa que entró sin prueba y solo cambió de plan SÍ recibe su prueba al volver a dar de alta', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const noTrialPlanId = await createPlan(stamp, 0)
    const trialPlanId = await createPlan(stamp + 1, 7)
    const businessUnit = await createBusinessUnit(stamp, 'rn04')
    const service = new BillingSubscriptionService()

    try {
      // 1) Alta sin prueba: nace pagando directo.
      const original = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: noTrialPlanId,
        contractedEmployees: 10,
        skipTrial: true,
      })
      assert.equal(original.billingSubscriptionStatus, 'active')
      assert.isNull(original.billingSubscriptionTrialEndsAt)

      // 2) Cambia de plan a uno que sí ofrece prueba: reescribe
      //    contracted_trial_days, pero trial_ends_at sigue null (createSubscription
      //    es el único método que lo escribe, changePlan nunca lo toca).
      const changed = await service.changePlan(original.billingSubscriptionId, trialPlanId)
      assert.equal(changed.billingSubscriptionContractedTrialDays, 7)
      assert.isNull(changed.billingSubscriptionTrialEndsAt)

      // 3) Se cancela y se da de alta una suscripción nueva para la misma
      //    empresa: con el criterio viejo (contracted_trial_days > 0) el
      //    sistema le negaba la prueba (nacía 'active'). Con el criterio
      //    nuevo (trial_ends_at) debe reconocer que nunca tuvo prueba.
      const replacement = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
        replaceLiveSubscription: true,
      })

      assert.equal(replacement.billingSubscriptionStatus, 'trialing')
      assert.isNotNull(replacement.billingSubscriptionTrialEndsAt)
      assert.isAbove(replacement.billingSubscriptionContractedTrialDays, 0)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(noTrialPlanId)
      await cleanupPlan(trialPlanId)
    }
  })

  test('RN-03 (caso legítimo): empresa que ya gozó su prueba sigue sin prueba al dar de alta otra suscripción, aunque la primera ya no esté vigente', async ({
    assert,
  }) => {
    const stamp = Date.now() + 2
    const trialPlanId = await createPlan(stamp, 7)
    const businessUnit = await createBusinessUnit(stamp, 'rn03')
    const service = new BillingSubscriptionService()

    try {
      // 1) Alta con prueba real: trial_ends_at queda poblado.
      const original = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 10,
      })
      assert.equal(original.billingSubscriptionStatus, 'trialing')
      assert.isNotNull(original.billingSubscriptionTrialEndsAt)

      // 2) Se reemplaza (la original queda cancelada, ya no vigente) y se da
      //    de alta una nueva: sigue sin prueba — la regla de una prueba por
      //    empresa sobrevive a que la suscripción original ya no esté viva.
      const replacement = await service.createSubscription({
        businessUnitPublicId: businessUnit.businessUnitPublicId,
        billingPlanId: trialPlanId,
        contractedEmployees: 20,
        replaceLiveSubscription: true,
      })

      assert.equal(replacement.billingSubscriptionStatus, 'active')
      assert.equal(replacement.billingSubscriptionContractedTrialDays, 0)
      assert.isNull(replacement.billingSubscriptionTrialEndsAt)
    } finally {
      await cleanupBusinessUnit(businessUnit.businessUnitId)
      await cleanupPlan(trialPlanId)
    }
  })
})

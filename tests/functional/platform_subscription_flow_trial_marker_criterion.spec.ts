import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import PlatformSubscriptionFlowService from '#services/platform_subscription_flow_service'

/**
 * USRH1789151097443 — la cifra de conversiones de la tarjeta de Movimiento
 * debe decidir "tuvo prueba" por `trial_ends_at` y NUNCA por
 * `contracted_trial_days` (RN-01/RN-02).
 *
 * El servicio suma sobre TODAS las suscripciones vivas del mes (universo
 * global, sin filtro por empresa), así que la base de datos de pruebas puede
 * traer otros fixtures del mes en curso. Por eso este grupo mide el DELTA
 * (antes/después de sembrar) en vez de una cifra absoluta — el mismo patrón
 * que usan `platform_mrr_series_*` para el mismo tipo de agregado global.
 */

async function createPlan(stamp: number, trialDays: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Flow Trial Marker Plan ${trialDays}d ${stamp}`,
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
  businessUnit.businessUnitName = `Flow Trial Marker ${tag} BU ${stamp}`
  businessUnit.businessUnitSlug = `flow-trial-marker-${tag}-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Flow Trial Marker ${tag} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function registerFirstPayment(subscriptionId: number, reference: string): Promise<void> {
  const now = DateTime.now()
  await BillingPayment.create({
    billingSubscriptionId: subscriptionId,
    billingPaymentAmountCents: 65_000,
    billingPaymentPeriodAmountCents: 65_000,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: 65_000,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: 65_000,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: 65_000,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: reference,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: now,
    billingPaymentPeriodStart: now.startOf('month'),
    billingPaymentPeriodEnd: now.startOf('month').plus({ months: 1 }),
  })
}

async function cleanupBusinessUnit(businessUnitId: number): Promise<void> {
  await BillingPayment.query()
    .whereIn(
      'billing_subscription_id',
      BillingSubscription.query()
        .withTrashed()
        .where('business_unit_id', businessUnitId)
        .select('billing_subscription_id')
    )
    .delete()
  await BillingSubscription.query().withTrashed().where('business_unit_id', businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
}

async function cleanupPlan(planId: number): Promise<void> {
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

test.group(
  'PlatformSubscriptionFlowService.getSubscriptionFlows — criterio de conversión (USRH1789151097443)',
  () => {
    test('cuenta por trial_ends_at, no por contracted_trial_days: caso que deja de contar y caso legítimo que sigue contando', async ({
      assert,
    }) => {
      const stamp = Date.now()
      const noTrialPlanId = await createPlan(stamp, 0)
      const trialPlanId = await createPlan(stamp + 1, 7)

      const subscriptionService = new BillingSubscriptionService()
      const flowService = new PlatformSubscriptionFlowService()

      const before = await flowService.getSubscriptionFlows()

      const buSinPrueba = await createBusinessUnit(stamp, 'sin-prueba')
      const buConPrueba = await createBusinessUnit(stamp + 1, 'con-prueba')

      try {
        // Empresa A: entró SIN prueba (pagando directo) y luego cambió a un
        // plan que sí ofrece prueba. contracted_trial_days queda en 7,
        // trial_ends_at sigue null. Con el criterio viejo, su primer pago
        // se contaba como conversión. No debe contar.
        const subA = await subscriptionService.createSubscription({
          businessUnitPublicId: buSinPrueba.businessUnitPublicId,
          billingPlanId: noTrialPlanId,
          contractedEmployees: 10,
          skipTrial: true,
        })
        await subscriptionService.changePlan(subA.billingSubscriptionId, trialPlanId)
        await registerFirstPayment(subA.billingSubscriptionId, `FLOW-A-${stamp}`)

        // Empresa B: sí tuvo prueba real (trial_ends_at poblado) y ahora
        // paga por primera vez. Caso legítimo: debe seguir contando.
        const subB = await subscriptionService.createSubscription({
          businessUnitPublicId: buConPrueba.businessUnitPublicId,
          billingPlanId: trialPlanId,
          contractedEmployees: 10,
        })
        await registerFirstPayment(subB.billingSubscriptionId, `FLOW-B-${stamp}`)

        const after = await flowService.getSubscriptionFlows()

        // Solo B convierte: el delta de conversiones es 1, no 2.
        assert.equal(after.actual.conversiones - before.actual.conversiones, 1)

        // RN-06: las otras tres cifras se mueven solo por las altas que
        // este fixture añadió (A y B), nunca por el criterio de conversión.
        assert.equal(after.actual.altas - before.actual.altas, 2)
        assert.equal(after.actual.cancelaciones - before.actual.cancelaciones, 0)
        assert.equal(after.actual.morosidad - before.actual.morosidad, 0)
        assert.equal(
          after.actual.suscripcionesInicioMes - before.actual.suscripcionesInicioMes,
          0
        )
      } finally {
        await cleanupBusinessUnit(buSinPrueba.businessUnitId)
        await cleanupBusinessUnit(buConPrueba.businessUnitId)
        await cleanupPlan(noTrialPlanId)
        await cleanupPlan(trialPlanId)
      }
    })
  }
)

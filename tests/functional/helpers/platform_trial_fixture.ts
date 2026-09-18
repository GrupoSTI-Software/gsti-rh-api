import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'

/**
 * Helper compartido de siembra de tenants con prueba (USRH1789079078169, §2
 * — alcance obligatorio A32). Entregable, no andamio: lo consumen los tres
 * specs de esta HU y, sin migración de por medio, cualquier rebanada
 * siguiente que necesite un tenant con prueba ya sembrado (`USRH1789079078170`,
 * `USRH1789079078171`, `USRH1789079078173`).
 *
 * Molde factorizado de `tests/functional/platform_mrr_series_service.spec.ts`
 * (plan + precio en `:43-70`, suscripción en `:80-125`, limpieza con
 * `.withTrashed()` + `.forceDelete()` en `:168-187`).
 */

export interface TenantTrialFixtureSpec {
  /** Etiqueta corta para nombrar la empresa y el plan (solo trazabilidad en debug). */
  tag: string
  /** Días de prueba del plan. Se ignora si `skipTrial` es `true`. */
  trialDays: number
  /** `true` = la suscripción se contrata sin prueba (`trial_ends_at` queda `NULL`). */
  skipTrial?: boolean
  /**
   * Desplaza `subscribed_at` contra hoy, en días (negativo = en el pasado).
   * Por omisión `0` (recién dada de alta hoy). Impreciso para pruebas que
   * necesitan caer en un mes civil exacto: la hora de "hoy" se conserva, y
   * cerca de la medianoche UTC puede correr el día civil de México al mes
   * vecino. Para eso usar `subscribedAtOverride`.
   */
  startOffsetDays?: number
  /** Sobrescribe `subscribed_at` con un valor exacto (`YYYY-MM-DD` o `YYYY-MM-DD HH:mm:ss`). Gana sobre `startOffsetDays`. */
  subscribedAtOverride?: string
  /** Status final a forzar. Por omisión el que deja `createSubscription` (`'trialing'` con prueba). */
  status?: 'trialing' | 'active' | 'past_due' | 'canceled'
  /** Fecha de cancelación (`YYYY-MM-DD`) a forzar. Omitido/`null` = sin cancelar. */
  canceledAt?: string | null
  /** Sobrescribe `trial_ends_at` con un valor exacto (`YYYY-MM-DD`). */
  trialEndsAtOverride?: string
  /** Sobrescribe `contracted_trial_days` (simula el drift de un cambio de plan, RN-04). */
  contractedTrialDaysOverride?: number
  /** Borra lógicamente la suscripción sembrada (R-3: universo declarado igual al de la tarjeta de Movimiento). */
  subscriptionDeleted?: boolean
  /** Borra lógicamente la empresa sembrada. */
  businessUnitDeleted?: boolean
}

export interface TenantTrialFixtureTenant {
  tag: string
  businessUnitId: number
  businessUnitPublicId: string
  businessUnitName: string
  /** `null` si la empresa nunca tuvo suscripción con prueba (universo "sin prueba"). */
  billingSubscriptionId: number | null
  planId: number
}

export interface TenantTrialFixture {
  tenants: TenantTrialFixtureTenant[]
  cleanup: () => Promise<void>
}

async function createPublishedPlan(tag: string, stamp: number, trialDays: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Trial Fixture ${tag} ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1789079078169',
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

async function createBusinessUnit(tag: string, stamp: number): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Trial Fixture ${tag} BU ${stamp}`
  businessUnit.businessUnitSlug = `trial-fixture-${tag}-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Trial Fixture ${tag} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

/** Sobrescribe columnas de una suscripción ya creada, a mano y sin hooks, para fijar fechas/estado exactos. */
async function forceSubscriptionRow(
  billingSubscriptionId: number,
  overrides: Record<string, unknown>
): Promise<void> {
  await db.from('billing_subscriptions').where('billing_subscription_id', billingSubscriptionId).update(overrides)
}

/**
 * Crea `specs.length` tenants en una sola llamada, cada uno con su plan,
 * business unit y (salvo `skipTrial`) su suscripción con prueba, aplicando
 * los overrides pedidos. Devuelve los identificadores y su `cleanup()`.
 */
export async function createTenantTrialFixture(
  specs: TenantTrialFixtureSpec[]
): Promise<TenantTrialFixture> {
  const stampBase = Date.now() + Math.floor(Math.random() * 100_000)
  const subscriptionService = new BillingSubscriptionService()
  const tenants: TenantTrialFixtureTenant[] = []

  for (const [i, spec] of specs.entries()) {
    const stamp = stampBase + i
    const planId = await createPublishedPlan(spec.tag, stamp, spec.skipTrial ? 0 : spec.trialDays)
    const businessUnit = await createBusinessUnit(spec.tag, stamp)

    let billingSubscriptionId: number | null = null

    const subscription = await subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId: planId,
      contractedEmployees: 10,
      skipTrial: spec.skipTrial,
    })
    billingSubscriptionId = subscription.billingSubscriptionId

    const overrides: Record<string, unknown> = {}
    if (spec.subscribedAtOverride !== undefined) {
      overrides.billing_subscription_subscribed_at = spec.subscribedAtOverride
    } else if (spec.startOffsetDays !== undefined) {
      overrides.billing_subscription_subscribed_at = DateTime.utc()
        .plus({ days: spec.startOffsetDays })
        .toFormat('yyyy-MM-dd HH:mm:ss')
    }
    if (spec.trialEndsAtOverride !== undefined) {
      overrides.billing_subscription_trial_ends_at = spec.trialEndsAtOverride
    }
    if (spec.contractedTrialDaysOverride !== undefined) {
      overrides.billing_subscription_contracted_trial_days = spec.contractedTrialDaysOverride
    }
    if (spec.status !== undefined) {
      overrides.billing_subscription_status = spec.status
      if (spec.status !== 'trialing') {
        // Libera el UNIQUE de "suscripción viva": una prueba terminada a mano
        // no debe seguir marcada como la viva de la empresa.
        overrides.billing_subscription_live_business_unit_id = null
      }
    }
    if (spec.canceledAt !== undefined) {
      overrides.billing_subscription_canceled_at = spec.canceledAt
    }
    if (Object.keys(overrides).length > 0) {
      await forceSubscriptionRow(billingSubscriptionId, overrides)
    }

    if (spec.subscriptionDeleted) {
      await forceSubscriptionRow(billingSubscriptionId, {
        billing_subscription_deleted_at: DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss'),
        billing_subscription_live_business_unit_id: null,
      })
    }
    if (spec.businessUnitDeleted) {
      await businessUnit.delete()
    }

    tenants.push({
      tag: spec.tag,
      businessUnitId: businessUnit.businessUnitId,
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      businessUnitName: businessUnit.businessUnitName,
      billingSubscriptionId,
      planId,
    })
  }

  const cleanup = async (): Promise<void> => {
    const planIds = new Set<number>()
    for (const tenant of tenants) {
      await BillingSubscription.query()
        .withTrashed()
        .where('business_unit_id', tenant.businessUnitId)
        .delete()
      await BusinessUnit.query().withTrashed().where('business_unit_id', tenant.businessUnitId).delete()
      planIds.add(tenant.planId)
    }
    for (const planId of planIds) {
      await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
      await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
      const plan = await BillingPlan.find(planId)
      if (plan) await plan.delete()
    }
  }

  return { tenants, cleanup }
}

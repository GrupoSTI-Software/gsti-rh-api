import { BaseSeeder } from '@adonisjs/lucid/seeders'
import BillingCatalogService from '../../app/services/billing_catalog_service.js'
import BillingPlan from '../../app/models/billing_plan.js'
import BillingPlanPrice from '../../app/models/billing_plan_price.js'
import BillingVolumeTier from '../../app/models/billing_volume_tier.js'

/**
 * Siembra el plan base "Acceso total" con:
 *  - Un precio vigente desde 2025-01-01 (MXN $65 / empleado / mes, IVA 16 %)
 *  - 5 tramos de descuento por volumen:
 *      1 empleado   →  0 %
 *     26 empleados  →  5 %
 *     51 empleados  → 10 %
 *    101 empleados  → 15 %
 *    201 empleados  → 20 %
 *
 * El plan se siembra en estado BORRADOR (no publicado) para que el equipo de GSTI
 * lo revise y lo publique manualmente desde la consola landlord.
 *
 * Idempotente: si el plan ya existe (búsqueda por nombre exacto), no lo vuelve
 * a insertar ni modifica nada.
 */
export default class BillingCatalogSeeder extends BaseSeeder {
  async run() {
    const PLAN_NAME = 'Acceso total'

    const existing = await BillingPlan.query().where('billing_plan_name', PLAN_NAME).first()

    if (existing) {
      return
    }

    const service = new BillingCatalogService()

    const plan = await service.createPlan({
      billingPlanName: PLAN_NAME,
      billingPlanDescription: 'Plan base de acceso completo a la plataforma Valanserh.',
      billingPlanProvider: 'manual',
    })

    await BillingPlanPrice.create({
      billingPlanId: plan.billingPlanId,
      billingPlanPriceAmount: 65.0,
      billingPlanPriceCurrency: 'MXN',
      billingPlanPriceTaxRate: 0.16,
      billingPlanPriceTrialDays: 7,
      billingPlanPriceEffectiveFrom: '2025-01-01',
      billingPlanPriceStripePriceId: null,
      billingPlanPriceProvider: 'manual',
    })

    const tiers: Array<{ min: number; discount: number }> = [
      { min: 1, discount: 0 },
      { min: 26, discount: 5 },
      { min: 51, discount: 10 },
      { min: 101, discount: 15 },
      { min: 201, discount: 20 },
    ]

    for (const t of tiers) {
      await BillingVolumeTier.create({
        billingPlanId: plan.billingPlanId,
        billingVolumeTierMinEmployees: t.min,
        billingVolumeTierDiscountPercent: t.discount,
      })
    }
  }
}

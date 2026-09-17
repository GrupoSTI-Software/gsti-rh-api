import { BaseSeeder } from '@adonisjs/lucid/seeders'
import BillingCatalogService from '../../app/services/billing_catalog_service.js'
import BillingPlan from '../../app/models/billing_plan.js'
import BillingPlanPrice from '../../app/models/billing_plan_price.js'
import BillingVolumeTier from '../../app/models/billing_volume_tier.js'
import { toBusinessDateString } from '../../app/utils/business_date.js'

/**
 * Siembra el plan base "Valanserh Compliance" con:
 *  - Un precio vigente desde 2026-09-28 (MXN $195 / empleado / mes, IVA 16 %,
 *    20 días de prueba) — fecha de arranque comercial.
 *  - 5 tramos de descuento por volumen:
 *      1 empleado   →  0 %
 *     50 empleados  → 10 %
 *    100 empleados  → 10 %
 *    200 empleados  → 15 %
 *    500 empleados  → 20 %
 *
 * El seeder CONVERGE hacia el plan publicado y público: el dominio exige un
 * precio con vigencia igual o anterior a hoy para publicar, así que antes del
 * arranque comercial el plan queda en BORRADOR y el primer `db:seed` a partir
 * de esa fecha lo publica y lo señala como plan público de la landing, sin paso
 * manual en landlord. Publicar congela precio y tramos de forma irreversible:
 * cualquier ajuste posterior pasa por clonar el plan.
 *
 * Idempotente y respetuoso de lo decidido en landlord: si el plan ya existe no
 * se reinserta, un plan retirado (`active = 0`) no se vuelve a tocar y la marca
 * de público solo se pone cuando no hay otro plan público vivo.
 */
export default class BillingCatalogSeeder extends BaseSeeder {
  async run() {
    const PLAN_NAME = 'Valanserh Compliance'
    const service = new BillingCatalogService()

    const existing = await BillingPlan.query().where('billing_plan_name', PLAN_NAME).first()
    const plan = existing ?? (await this.seedDraft(service, PLAN_NAME))

    await this.publishWhenPriceIsCurrent(service, plan)
  }

  /** Crea el plan en borrador con su precio y sus tramos de volumen. */
  private async seedDraft(
    service: BillingCatalogService,
    planName: string
  ): Promise<BillingPlan> {
    const plan = await service.createPlan({
      billingPlanName: planName,
      billingPlanDescription:
        'Plan base de acceso completo a la plataforma Valanserh y cumplimiento de normativas1. .',
      billingPlanProvider: 'manual',
    })

    await BillingPlanPrice.create({
      billingPlanId: plan.billingPlanId,
      billingPlanPriceAmount: 150.0,
      billingPlanPriceCurrency: 'MXN',
      billingPlanPriceTaxRate: 0.16,
      billingPlanPriceTrialDays: 20,
      billingPlanPriceEffectiveFrom: '2026-01-01',
      billingPlanPriceStripePriceId: null,
      billingPlanPriceProvider: 'manual',
    })

    const tiers: Array<{ min: number; discount: number }> = [
      { min: 1, discount: 0 },
      { min: 50, discount: 15 },
      { min: 150, discount: 20 },
      { min: 400, discount: 25 },
      { min: 500, discount: 27 },
    ]

    for (const t of tiers) {
      await BillingVolumeTier.create({
        billingPlanId: plan.billingPlanId,
        billingVolumeTierMinEmployees: t.min,
        billingVolumeTierDiscountPercent: t.discount,
      })
    }

    return plan
  }

  /**
   * Publica el plan y lo señala como público en cuanto su precio entra en
   * vigencia. Antes de esa fecha no hace nada: el plan sigue en borrador y la
   * siguiente corrida vuelve a evaluarlo.
   */
  private async publishWhenPriceIsCurrent(
    service: BillingCatalogService,
    plan: BillingPlan
  ): Promise<void> {
    if (plan.isPublished || plan.billingPlanActive !== 1) {
      return
    }

    const currentPrice = await BillingPlanPrice.query()
      .where('billing_plan_id', plan.billingPlanId)
      .where('billing_plan_price_effective_from', '<=', toBusinessDateString())
      .first()

    if (!currentPrice) {
      return
    }

    const published = await service.publishPlan(plan.billingPlanId)

    if (published.billingPlanIsPublic === 1) {
      return
    }

    const otherPublicPlan = await BillingPlan.query()
      .where('billing_plan_is_public', 1)
      .whereNot('billing_plan_id', plan.billingPlanId)
      .first()

    if (!otherPublicPlan) {
      await service.markPlanAsPublic(plan.billingPlanId)
    }
  }
}

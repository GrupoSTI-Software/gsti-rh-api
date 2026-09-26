import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BillingPlan from './billing_plan.js'

/**
 * Versión de precio de un plan comercial.
 *
 * Append-only: una vez insertada, NUNCA se modifica ni se elimina.
 * El precio vigente es la versión con `effective_from` máximo ≤ hoy.
 * No lleva `updated_at` ni `deleted_at` (inmutabilidad como garantía de integridad).
 */
export default class BillingPlanPrice extends BaseModel {
  static readonly table = 'billing_plan_prices'

  @column({ isPrimary: true })
  declare billingPlanPriceId: number

  @column()
  declare billingPlanId: number

  @column()
  declare billingPlanPriceAmount: number

  @column()
  declare billingPlanPriceCurrency: string

  @column()
  declare billingPlanPriceTaxRate: number

  @column()
  declare billingPlanPriceTrialDays: number

  @column()
  declare billingPlanPriceEffectiveFrom: string

  @column()
  declare billingPlanPriceStripePriceId: string | null

  @column()
  declare billingPlanPriceProvider: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => BillingPlan, { foreignKey: 'billingPlanId' })
  declare plan: BelongsTo<typeof BillingPlan>
}

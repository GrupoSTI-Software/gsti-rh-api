import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BillingPlan from './billing_plan.js'

/**
 * Tramo de descuento por volumen de un plan comercial.
 *
 * Editable solo mientras el plan está en borrador.
 * Una vez publicado el plan, cualquier mutación se rechaza con PLT.CAT.TIER_PLAN_PUBLISHED.
 * El corte es inclusivo en el límite inferior: aplica el tramo con MAX(min_employees) ≤ N.
 */
export default class BillingVolumeTier extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'billing_volume_tiers'

  @column({ isPrimary: true })
  declare billingVolumeTierId: number

  @column()
  declare billingPlanId: number

  @column()
  declare billingVolumeTierMinEmployees: number

  @column()
  declare billingVolumeTierDiscountPercent: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'billing_volume_tier_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BillingPlan, { foreignKey: 'billingPlanId' })
  declare plan: BelongsTo<typeof BillingPlan>
}

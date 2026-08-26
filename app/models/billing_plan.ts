import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import BillingPlanPrice from './billing_plan_price.js'
import BillingVolumeTier from './billing_volume_tier.js'

/**
 * Plan comercial de la plataforma SaaS Valanserh.
 *
 * Tabla global de plataforma: sin `business_unit_id`.
 * El estado borrador/publicado se deriva de `billingPlanPublishedAt`:
 *   - NULL → borrador (tramos editables, aún no vendible)
 *   - NOT NULL → publicado (tramos congelados, irreversible)
 */
export default class BillingPlan extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'billing_plans'

  @column({ isPrimary: true })
  declare billingPlanId: number

  @column()
  declare billingPlanName: string

  @column()
  declare billingPlanDescription: string | null

  @column()
  declare billingPlanProvider: string

  @column()
  declare billingPlanStripeProductId: string | null

  @column()
  declare billingPlanActive: number

  @column()
  declare billingPlanIsPublic: number

  @column.dateTime()
  declare billingPlanPublishedAt: DateTime | null

  @column()
  declare billingPlanParentId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'billing_plan_deleted_at' })
  declare deletedAt: DateTime | null

  /** Estado derivado del campo publishedAt (nunca se persiste). */
  get status(): 'draft' | 'published' {
    return this.billingPlanPublishedAt ? 'published' : 'draft'
  }

  get isPublished(): boolean {
    return this.billingPlanPublishedAt !== null
  }

  @hasMany(() => BillingPlanPrice, { foreignKey: 'billingPlanId' })
  declare prices: HasMany<typeof BillingPlanPrice>

  @hasMany(() => BillingVolumeTier, { foreignKey: 'billingPlanId' })
  declare volumeTiers: HasMany<typeof BillingVolumeTier>
}

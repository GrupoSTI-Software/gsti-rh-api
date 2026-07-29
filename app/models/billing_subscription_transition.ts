import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BillingSubscription from './billing_subscription.js'

/** Razones válidas de transición de estado del reloj de suscripción. */
export type BillingSubscriptionTransitionReason =
  | 'trial_expired_uncovered'
  | 'trial_expired_covered'
  | 'period_expired'

/**
 * Bitácora append-only de transiciones de estado disparadas por el reloj
 * de suscripción (USRH1784574994921).
 *
 * El UNIQUE (billing_subscription_id, billing_subscription_transition_cut_date)
 * garantiza idempotencia a nivel de base de datos: dos corridas del barrido
 * el mismo día de corte no pueden registrar dos filas para la misma suscripción.
 */
export default class BillingSubscriptionTransition extends BaseModel {
  static readonly table = 'billing_subscription_transitions'

  @column({ isPrimary: true })
  declare billingSubscriptionTransitionId: number

  @column()
  declare billingSubscriptionId: number

  @column()
  declare billingSubscriptionTransitionFrom: string

  @column()
  declare billingSubscriptionTransitionTo: string

  @column()
  declare billingSubscriptionTransitionReason: BillingSubscriptionTransitionReason

  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingSubscriptionTransitionCutDate: DateTime

  @column.dateTime({ autoCreate: true })
  declare billingSubscriptionTransitionCreatedAt: DateTime

  @belongsTo(() => BillingSubscription, { foreignKey: 'billingSubscriptionId' })
  declare subscription: BelongsTo<typeof BillingSubscription>
}

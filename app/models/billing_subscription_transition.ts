import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BillingSubscription from './billing_subscription.js'

/** Razones válidas de transición de estado del reloj de suscripción. */
export type BillingSubscriptionTransitionReason =
  | 'trial_expired_uncovered'
  | 'trial_expired_covered'
  | 'period_expired'
  | 'provider_past_due'
  | 'provider_unpaid'
  | 'provider_canceled'

export type BillingSubscriptionTransitionOrigin = 'clock' | 'provider'

/** Clave fija de origen para transiciones escritas por el reloj diario. */
export const BILLING_SUBSCRIPTION_TRANSITION_CLOCK_ORIGIN_KEY = 'clock'

/**
 * Bitácora append-only de transiciones de estado (USRH1784574994921; origen USRH1790724549026).
 *
 * UNIQUE (billing_subscription_id, billing_subscription_transition_cut_date,
 * billing_subscription_transition_origin_key): el reloj conserva a lo más una
 * fila por día (clave `clock`); el proveedor puede registrar una por aviso (`evt_…`).
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

  @column()
  declare billingSubscriptionTransitionOrigin: BillingSubscriptionTransitionOrigin

  @column()
  declare billingSubscriptionTransitionOriginKey: string

  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingSubscriptionTransitionCutDate: DateTime

  @column.dateTime({ autoCreate: true })
  declare billingSubscriptionTransitionCreatedAt: DateTime

  @belongsTo(() => BillingSubscription, { foreignKey: 'billingSubscriptionId' })
  declare subscription: BelongsTo<typeof BillingSubscription>
}

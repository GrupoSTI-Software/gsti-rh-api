import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { BillingProviderKey } from '#modules/billing-provider/billing_provider.port'
import BillingSubscription from './billing_subscription.js'

export const BILLING_PROVIDER_EVENT_STATUSES = {
  RECEIVED: 'received',
  PROCESSED: 'processed',
  IGNORED: 'ignored',
  FAILED: 'failed',
} as const

export type BillingProviderEventStatus =
  (typeof BILLING_PROVIDER_EVENT_STATUSES)[keyof typeof BILLING_PROVIDER_EVENT_STATUSES]

/**
 * Bitácora de avisos del proveedor de cobro (plataforma, sin tenant).
 * Append-only; sin payload ni PII (USRH1790708507579).
 */
export default class BillingProviderEvent extends BaseModel {
  static readonly table = 'billing_provider_events'

  @column({ isPrimary: true })
  declare billingProviderEventId: number

  @column()
  declare billingProviderEventProvider: BillingProviderKey

  @column()
  declare billingProviderEventExternalId: string

  @column()
  declare billingProviderEventType: string

  @column()
  declare billingProviderEventObjectId: string | null

  @column()
  declare billingProviderEventObjectType: string | null

  @column()
  declare billingProviderEventLivemode: boolean

  @column()
  declare billingProviderEventStatus: BillingProviderEventStatus

  @column()
  declare billingProviderEventAttempts: number

  @column()
  declare billingProviderEventLastErrorCode: string | null

  @column()
  declare billingSubscriptionId: number | null

  @column.dateTime()
  declare billingProviderEventProviderCreatedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare billingProviderEventReceivedAt: DateTime

  @column.dateTime()
  declare billingProviderEventProcessedAt: DateTime | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => BillingSubscription, { foreignKey: 'billingSubscriptionId' })
  declare billingSubscription: BelongsTo<typeof BillingSubscription>
}

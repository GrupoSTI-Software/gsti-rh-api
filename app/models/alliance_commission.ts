import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Alliance from '#models/alliance'
import AllianceAttribution from '#models/alliance_attribution'
import BillingPayment from '#models/billing_payment'
import BusinessUnit from '#models/business_unit'

/**
 * Comisión de alianza devengada al registrar un pago (ESB-07-09-09-09).
 *
 * Append-only: sin soft delete y sin `updated_at`. Ningún ajuste, cierre
 * ni agotamiento corrige o borra una fila. El UNIQUE de `billingPaymentId`
 * garantiza que un pago no cobre dos veces.
 */
export default class AllianceCommission extends BaseModel {
  static readonly table = 'alliance_commissions'

  @column({ isPrimary: true })
  declare allianceCommissionId: number

  @column()
  declare allianceId: number

  @column()
  declare allianceAttributionId: number

  @column({ serializeAs: null })
  declare businessUnitId: number

  @column()
  declare billingPaymentId: number

  @column()
  declare allianceCommissionPeriods: number

  @column()
  declare allianceCommissionBaseCents: number

  @column({ consume: (value: number | string) => Number(value) })
  declare allianceCommissionPercent: number

  @column()
  declare allianceCommissionAmountCents: number

  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare allianceCommissionPaidOn: DateTime

  @column.dateTime({ autoCreate: true })
  declare allianceCommissionCreatedAt: DateTime

  @belongsTo(() => Alliance, {
    foreignKey: 'allianceId',
    localKey: 'allianceId',
  })
  declare alliance: BelongsTo<typeof Alliance>

  @belongsTo(() => AllianceAttribution, {
    foreignKey: 'allianceAttributionId',
    localKey: 'allianceAttributionId',
  })
  declare attribution: BelongsTo<typeof AllianceAttribution>

  @belongsTo(() => BillingPayment, {
    foreignKey: 'billingPaymentId',
    localKey: 'billingPaymentId',
  })
  declare payment: BelongsTo<typeof BillingPayment>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}

import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BillingSubscription from './billing_subscription.js'

export type BillingPaymentMethod = 'transfer' | 'cash' | 'other'

/**
 * Registro inmutable de un pago manual de suscripción (USRH1784574994922).
 *
 * Append-only: sin soft delete, sin updated_at. Un pago nunca se edita ni
 * se borra; correcciones vía ajuste futuro. La FK RESTRICT impide eliminar
 * físicamente una suscripción con pagos.
 *
 * billing_payment_amount_cents almacena el monto en centavos (primera columna
 * billing en centavos; el resto del módulo se migrará en ticket posterior).
 */
export default class BillingPayment extends BaseModel {
  static readonly table = 'billing_payments'

  @column({ isPrimary: true })
  declare billingPaymentId: number

  @column()
  declare billingSubscriptionId: number

  /** Monto pagado en centavos (ej. 927800 = $9,278.00 MXN). */
  @column()
  declare billingPaymentAmountCents: number

  @column()
  declare billingPaymentMethod: BillingPaymentMethod

  @column()
  declare billingPaymentReference: string | null

  /** Key privada en S3. Nunca la URL pública. Descarga firmada en 04-05. */
  @column()
  declare billingPaymentReceiptPath: string | null

  @column()
  declare billingPaymentReceiptMime: string | null

  @column()
  declare billingPaymentProvider: string

  @column.dateTime()
  declare billingPaymentPaidAt: DateTime

  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingPaymentPeriodStart: DateTime

  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingPaymentPeriodEnd: DateTime

  @column.dateTime({ autoCreate: true })
  declare billingPaymentCreatedAt: DateTime

  @belongsTo(() => BillingSubscription, { foreignKey: 'billingSubscriptionId' })
  declare subscription: BelongsTo<typeof BillingSubscription>
}

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
 *
 * Desde USRH1785962095095 el monto del flujo normal lo gobierna el servidor
 * (`billing_subscription_contracted_total`); `billingPaymentIsCustomAmount`
 * marca cuándo el importe vino de la capacidad explícita de importe distinto.
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

  /** Monto del periodo vigente al asentar el pago (gobernado por el servidor). */
  @column()
  declare billingPaymentPeriodAmountCents: number

  /** Cantidad de periodos completos que este pago cubrió (0 = parcial, no movió el periodo). */
  @column()
  declare billingPaymentPeriodsCovered: number

  /** Saldo a favor aplicado por este pago (`periodsCovered * periodAmountCents`). */
  @column()
  declare billingPaymentCreditAppliedCents: number

  /** Saldo a favor de la suscripción justo después de este pago. */
  @column()
  declare billingPaymentCreditBalanceAfterCents: number

  /** `true` si el monto fue capturado como importe distinto explícito (`allowCustomAmount`). */
  @column()
  declare billingPaymentIsCustomAmount: boolean

  // ─── Foto financiera del periodo cobrado (regla 12; no se recalcula) ──────
  @column()
  declare billingPaymentGrossCents: number

  @column()
  declare billingPaymentDiscountAmountCents: number

  @column()
  declare billingPaymentSubtotalCents: number

  @column()
  declare billingPaymentTaxAmountCents: number

  @column()
  declare billingPaymentTotalCents: number

  @column()
  declare billingPaymentDiscountPercent: number

  @column()
  declare billingPaymentTaxRate: number

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

  /** Nulo cuando el pago fue parcial (`periodsCovered = 0`, no cubrió periodo). */
  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingPaymentPeriodStart: DateTime | null

  /** Nulo cuando el pago fue parcial (`periodsCovered = 0`, no cubrió periodo). */
  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingPaymentPeriodEnd: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare billingPaymentCreatedAt: DateTime

  @belongsTo(() => BillingSubscription, { foreignKey: 'billingSubscriptionId' })
  declare subscription: BelongsTo<typeof BillingSubscription>
}

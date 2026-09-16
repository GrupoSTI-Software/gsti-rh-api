import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BillingSubscription from './billing_subscription.js'
import BillingPayment from './billing_payment.js'
import type { DiscountCodeKind } from './discount_code.js'

export type BillingSubscriptionChangeType = 'increase' | 'decrease'

export type BillingSubscriptionChangeStatus =
  | 'pending_payment'
  | 'scheduled'
  | 'applied'
  | 'canceled'
  | 'not_applicable'

/** Estados que cuentan como "cambio vivo" para el invariante de uno solo por suscripción. */
export const LIVE_SUBSCRIPTION_CHANGE_STATUSES: BillingSubscriptionChangeStatus[] = [
  'pending_payment',
  'scheduled',
]

/**
 * @swagger
 * components:
 *   schemas:
 *     BillingSubscriptionChange:
 *       type: object
 *       description: |
 *         Solicitud de cambio de la cantidad contratada de una suscripción
 *         (USRH1786107870850). Los importes del periodo y el adeudo se congelan
 *         al solicitar; un cambio nunca se borra, se cancela vía estado terminal.
 *         Compartida con la reducción agendada (historias hermanas del set).
 *         El aislamiento por empresa es manual en cada consulta (sin mixin de scope).
 *       properties:
 *         billingSubscriptionChangeId:
 *           type: integer
 *           description: Identificador del cambio de suscripción
 *         billingSubscriptionId:
 *           type: integer
 *           description: Suscripción padre sobre la que se pidió el cambio
 *         businessUnitId:
 *           type: integer
 *           description: Empresa denormalizada para filtrado manual (no expuesta en API tenant)
 *         billingSubscriptionChangeType:
 *           type: string
 *           enum: [increase, decrease]
 *           description: Tipo de cambio solicitado
 *         billingSubscriptionChangeStatus:
 *           type: string
 *           enum: [pending_payment, scheduled, applied, canceled, not_applicable]
 *           description: |
 *             Estado del desenlace. Vivos: pending_payment, scheduled.
 *             Terminales: applied, canceled, not_applicable.
 *         billingSubscriptionChangePreviousEmployees:
 *           type: integer
 *           description: Cantidad contratada antes del cambio
 *         billingSubscriptionChangeNewEmployees:
 *           type: integer
 *           description: Cantidad pedida
 *         billingSubscriptionChangeUnitAmount:
 *           type: number
 *           format: double
 *           description: Precio unitario congelado al solicitar (pesos)
 *         billingSubscriptionChangeDiscountPercent:
 *           type: number
 *           format: double
 *           description: Descuento por volumen congelado (%)
 *         billingSubscriptionChangeTaxRate:
 *           type: number
 *           format: double
 *           description: Tasa de IVA congelada (ej. 0.16)
 *         billingSubscriptionChangeSubtotal:
 *           type: number
 *           format: double
 *           description: Subtotal del periodo al tamaño nuevo (pesos)
 *         billingSubscriptionChangeTaxAmount:
 *           type: number
 *           format: double
 *           description: IVA del periodo al tamaño nuevo (pesos)
 *         billingSubscriptionChangeTotal:
 *           type: number
 *           format: double
 *           description: Total del periodo al tamaño nuevo (pesos)
 *         billingSubscriptionChangeProratedAmountCents:
 *           type: integer
 *           description: Adeudo prorrateado en centavos (0 en prueba o reducción)
 *         billingSubscriptionChangeEffectiveAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Fecha de efecto (solo reducción agendada)
 *         billingSubscriptionChangeAppliedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Momento en que el cambio dejó de estar pendiente
 *         billingSubscriptionChangeBillingPaymentId:
 *           type: integer
 *           nullable: true
 *           description: Pago que destrabó el aumento (lo llena otra historia)
 *         billingSubscriptionChangeNotApplicableReason:
 *           type: string
 *           nullable: true
 *           description: Motivo cuando el estado es not_applicable (reducción)
 *         billingSubscriptionChangeCreatedAt:
 *           type: string
 *           format: date-time
 *         billingSubscriptionChangeUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         billingSubscriptionChangeDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Borrado lógico (cancelación usa estado, no delete)
 */
export default class BillingSubscriptionChange extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'billing_subscription_changes'

  @column({ isPrimary: true })
  declare billingSubscriptionChangeId: number

  @column()
  declare billingSubscriptionId: number

  @column({ serializeAs: null })
  declare businessUnitId: number

  @column()
  declare billingSubscriptionChangeType: BillingSubscriptionChangeType

  @column()
  declare billingSubscriptionChangeStatus: BillingSubscriptionChangeStatus

  @column()
  declare billingSubscriptionChangePreviousEmployees: number

  @column()
  declare billingSubscriptionChangeNewEmployees: number

  /** DECIMAL: el driver lo entrega como string. Envolver con Number() al operar. */
  @column()
  declare billingSubscriptionChangeUnitAmount: number

  @column()
  declare billingSubscriptionChangeDiscountPercent: number

  @column()
  declare billingSubscriptionChangeTaxRate: number

  @column()
  declare billingSubscriptionChangeSubtotal: number

  @column()
  declare billingSubscriptionChangeTaxAmount: number

  @column()
  declare billingSubscriptionChangeTotal: number

  /** Adeudo en CENTAVOS enteros (ej. 91210 = $912.10 MXN). Nunca negativo. */
  @column()
  declare billingSubscriptionChangeProratedAmountCents: number

  // ---------------------------------------------------------------------
  // Congelado del código de descuento (USRH1787714804405 §10). Se llena
  // junto con los campos de arriba al solicitar o agendar el cambio; la
  // aplicación los transcribe a la suscripción sin volver a preguntarle
  // al catálogo. NULL/0 cuando la suscripción no tiene código congelado.
  // ---------------------------------------------------------------------

  /** Pesos que el código descuenta en el trato nuevo; 0 sin código o con el beneficio agotado. */
  @column()
  declare billingSubscriptionChangeCodeDiscountAmount: number

  /** Precio de lista por empleado del trato nuevo; espeja el de la suscripción. */
  @column()
  declare billingSubscriptionChangeUndiscountedUnitAmount: number | null

  /** Subtotal del trato nuevo sin el código (con el descuento por volumen ya aplicado). */
  @column()
  declare billingSubscriptionChangeUndiscountedSubtotal: number | null

  @column()
  declare billingSubscriptionChangeUndiscountedTaxAmount: number | null

  @column()
  declare billingSubscriptionChangeUndiscountedTotal: number | null

  /** Evidencia del código vigente en la suscripción al congelar este cambio; base de la guarda de código desfasado. */
  @column()
  declare billingSubscriptionChangeDiscountCodeText: string | null

  @column()
  declare billingSubscriptionChangeDiscountCodeKind: DiscountCodeKind | null

  @column.dateTime()
  declare billingSubscriptionChangeEffectiveAt: DateTime | null

  @column.dateTime()
  declare billingSubscriptionChangeAppliedAt: DateTime | null

  @column()
  declare billingSubscriptionChangeBillingPaymentId: number | null

  @column()
  declare billingSubscriptionChangeNotApplicableReason: string | null

  @column.dateTime({ autoCreate: true })
  declare billingSubscriptionChangeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare billingSubscriptionChangeUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'billing_subscription_change_deleted_at' })
  declare deletedAt: DateTime | null

  get isLive(): boolean {
    return LIVE_SUBSCRIPTION_CHANGE_STATUSES.includes(this.billingSubscriptionChangeStatus)
  }

  @belongsTo(() => BillingSubscription, { foreignKey: 'billingSubscriptionId' })
  declare subscription: BelongsTo<typeof BillingSubscription>

  @belongsTo(() => BillingPayment, { foreignKey: 'billingSubscriptionChangeBillingPaymentId' })
  declare payment: BelongsTo<typeof BillingPayment>
}

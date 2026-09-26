import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from './business_unit.js'
import BillingPlan from './billing_plan.js'
import BillingPlanPrice from './billing_plan_price.js'
import DiscountCode, { type DiscountCodeKind } from './discount_code.js'

export type BillingSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

/** Estados que cuentan como "suscripción viva" para el candado de una-por-empresa. */
export const LIVE_SUBSCRIPTION_STATUSES: BillingSubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
]

/**
 * Contrato de membresía de una empresa con GSTI (write-once por snapshot).
 *
 * El precio por empleado, el descuento y los días de prueba se congelan al
 * contratar desde el catálogo vigente ese día; un cambio posterior del
 * catálogo (`BillingPlan`/`BillingPlanPrice`/`BillingVolumeTier`) NUNCA
 * altera una suscripción ya creada. Las columnas `billingPlanId` y
 * `billingPlanPriceId` son solo referencia de origen (linaje del trato),
 * no fuente de verdad del cobro.
 *
 * `billingSubscriptionLiveBusinessUnitId` es la columna espejo (UNIQUE) que
 * garantiza a nivel de base de datos que una empresa tenga a lo más una
 * suscripción viva; se refuerza con `SELECT ... FOR UPDATE` en el service.
 */
export default class BillingSubscription extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'billing_subscriptions'

  @column({ isPrimary: true })
  declare billingSubscriptionId: number

  @column({ serializeAs: null })
  declare businessUnitId: number

  @column()
  declare billingPlanId: number

  @column()
  declare billingPlanPriceId: number

  @column()
  declare billingSubscriptionProvider: string

  @column()
  declare billingSubscriptionStatus: BillingSubscriptionStatus

  @column()
  declare billingSubscriptionContractedUnitAmount: number

  @column()
  declare billingSubscriptionContractedEmployees: number

  @column()
  declare billingSubscriptionDiscountPercent: number

  @column()
  declare billingSubscriptionContractedTrialDays: number

  @column()
  declare billingSubscriptionContractedCurrency: string

  @column()
  declare billingSubscriptionContractedTaxRate: number

  @column()
  declare billingSubscriptionContractedSubtotal: number

  @column()
  declare billingSubscriptionContractedTaxAmount: number

  @column()
  declare billingSubscriptionContractedTotal: number

  /**
   * Saldo a favor vigente de la suscripción, en centavos (USRH1785962095095).
   * Se lee y escribe siempre dentro de la transacción del pago con
   * `.forUpdate()` sobre la fila (ver `billing_payment_service.ts`).
   */
  @column()
  declare billingSubscriptionCreditBalanceCents: number

  // ---------------------------------------------------------------------
  // Canje y congelado del código de descuento (USRH1787714804401 §10).
  // Snapshot write-once: se llenan junto con los `contracted_*` al crear
  // la suscripción y ningún cambio posterior del catálogo las altera.
  // NULL en las 10 columnas cuando el alta no trajo `discountCode`.
  // ---------------------------------------------------------------------

  @column()
  declare billingSubscriptionDiscountCodeId: number | null

  @column()
  declare billingSubscriptionDiscountCodeText: string | null

  @column()
  declare billingSubscriptionDiscountCodeKind: DiscountCodeKind | null

  @column()
  declare billingSubscriptionDiscountCodeValue: number | null

  @column()
  declare billingSubscriptionDiscountCodeBenefitPeriods: number | null

  /** Nace en 0; lo mueve el cobro del periodo (eslabón 8), no esta HU. */
  @column()
  declare billingSubscriptionDiscountCodeBenefitPeriodsUsed: number

  /** Pesos que el código descuenta en el periodo vigente; 0 cuando no hay código. */
  @column()
  declare billingSubscriptionCodeDiscountAmount: number

  /**
   * Precio por empleado de lista, antes de que un código `unit_price` lo
   * sustituya. Se llena con `resolved.undiscountedPricePerEmployee`, nunca
   * se deduce de `billingSubscriptionContractedUnitAmount` ni se relee del
   * catálogo (§10.1).
   */
  @column()
  declare billingSubscriptionUndiscountedUnitAmount: number | null

  /** Totales sin el código: con el descuento por volumen ya aplicado, sin el del código. */
  @column()
  declare billingSubscriptionUndiscountedSubtotal: number | null

  @column()
  declare billingSubscriptionUndiscountedTaxAmount: number | null

  @column()
  declare billingSubscriptionUndiscountedTotal: number | null

  @column.date({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingSubscriptionContractedEffectiveFrom: DateTime

  @column.dateTime({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingSubscriptionTrialEndsAt: DateTime | null

  @column.dateTime({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingSubscriptionCurrentPeriodStart: DateTime | null

  @column.dateTime({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingSubscriptionCurrentPeriodEnd: DateTime | null

  @column()
  declare billingSubscriptionStripeCustomerId: string | null

  @column()
  declare billingSubscriptionStripeSubscriptionId: string | null

  @column.dateTime({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingSubscriptionSubscribedAt: DateTime

  @column.dateTime({
    serialize: (value: DateTime | null) => value?.toISODate() ?? null,
  })
  declare billingSubscriptionCanceledAt: DateTime | null

  /**
   * Columna espejo del candado de unicidad. Igual a `businessUnitId` mientras
   * la suscripción está viva; NULL al cancelar (04-04). Índice UNIQUE.
   */
  @column({ serializeAs: null })
  declare billingSubscriptionLiveBusinessUnitId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'billing_subscription_deleted_at' })
  declare deletedAt: DateTime | null

  get isLive(): boolean {
    return LIVE_SUBSCRIPTION_STATUSES.includes(this.billingSubscriptionStatus)
  }

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => BillingPlan, { foreignKey: 'billingPlanId' })
  declare plan: BelongsTo<typeof BillingPlan>

  @belongsTo(() => BillingPlanPrice, { foreignKey: 'billingPlanPriceId' })
  declare planPrice: BelongsTo<typeof BillingPlanPrice>

  @belongsTo(() => DiscountCode, { foreignKey: 'billingSubscriptionDiscountCodeId' })
  declare discountCode: BelongsTo<typeof DiscountCode>
}

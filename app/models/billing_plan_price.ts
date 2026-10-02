import { DateTime } from 'luxon'
import { BaseModel, beforeUpdate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { BILLING_CATALOG_ERROR_CODES } from '#constants/billing_catalog_error_codes'
import { BillingCatalogServiceError } from '#exceptions/billing_catalog_service_error'
import { BILLING_PROVIDER_KEYS } from '#modules/billing-provider/billing_provider.port'
import BillingPlan from './billing_plan.js'

const LINKABLE_COLUMNS = ['billingPlanPriceProvider', 'billingPlanPriceStripePriceId'] as const

/**
 * Versión de precio de un plan comercial.
 *
 * Append-only: una vez insertada, no se modifica ni se elimina, salvo la
 * vinculación con Stripe (USRH1790708507553): `provider` (`manual` → `stripe`)
 * y `stripe_price_id` (nulo → id), una sola vez. El candado `@beforeUpdate`
 * hace cumplir esa regla (USRH1790712873743).
 *
 * El precio vigente es la versión con `effective_from` máximo ≤ hoy.
 * No lleva `updated_at` ni `deleted_at` (inmutabilidad como garantía de integridad).
 */
export default class BillingPlanPrice extends BaseModel {
  static readonly table = 'billing_plan_prices'

  @column({ isPrimary: true })
  declare billingPlanPriceId: number

  @column()
  declare billingPlanId: number

  @column()
  declare billingPlanPriceAmount: number

  @column()
  declare billingPlanPriceCurrency: string

  @column()
  declare billingPlanPriceTaxRate: number

  @column()
  declare billingPlanPriceTrialDays: number

  @column()
  declare billingPlanPriceEffectiveFrom: string

  @column()
  declare billingPlanPriceStripePriceId: string | null

  @column()
  declare billingPlanPriceProvider: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => BillingPlan, { foreignKey: 'billingPlanId' })
  declare plan: BelongsTo<typeof BillingPlan>

  @beforeUpdate()
  static rejectPublishedPriceMutation(price: BillingPlanPrice) {
    if (!price.$original) {
      return
    }

    const dirty = Object.keys(price.$dirty)
    if (dirty.length === 0) {
      return
    }

    const original = price.$original as Partial<BillingPlanPrice>
    const onlyLinkable = dirty.every((key) =>
      (LINKABLE_COLUMNS as readonly string[]).includes(key)
    )
    const providerOk =
      !dirty.includes('billingPlanPriceProvider') ||
      (original.billingPlanPriceProvider === BILLING_PROVIDER_KEYS.MANUAL &&
        price.billingPlanPriceProvider === BILLING_PROVIDER_KEYS.STRIPE)
    const idOk =
      !dirty.includes('billingPlanPriceStripePriceId') ||
      ((original.billingPlanPriceStripePriceId ?? null) === null &&
        typeof price.billingPlanPriceStripePriceId === 'string' &&
        price.billingPlanPriceStripePriceId.length > 0)
    const coherent =
      price.billingPlanPriceProvider !== BILLING_PROVIDER_KEYS.STRIPE ||
      price.billingPlanPriceStripePriceId !== null

    if (!(onlyLinkable && providerOk && idOk && coherent)) {
      throw new BillingCatalogServiceError(
        'Mutación no permitida en versión de precio publicada',
        BILLING_CATALOG_ERROR_CODES.PRICE_IMMUTABLE,
        422,
        'version-de-precio-inmutable',
        'Una versión de precio publicada no se modifica. Publica una versión nueva.'
      )
    }
  }
}

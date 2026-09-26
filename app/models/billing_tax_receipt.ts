import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import encryption from '@adonisjs/core/services/encryption'
import { BILLING_TAX_RECEIPT_STATUSES } from '#constants/billing_tax_receipt'
import BillingPayment from '#models/billing_payment'
import BillingSubscription from '#models/billing_subscription'
import SatCancellationReason from '#models/sat_cancellation_reason'

export type BillingTaxReceiptStatus = (typeof BILLING_TAX_RECEIPT_STATUSES)[number]

/**
 * Comprobante fiscal (CFDI) de una membresía de Valanserh (USRH1788288461952).
 *
 * No compone SoftDeletes: un comprobante no se borra, cambia de estado
 * (`issued` → `cancelled` / `substituted`) y se conserva. Cancelar no es borrar;
 * un `deleted_at` dejaría el pago bloqueado para siempre.
 *
 * No compone `withBusinessUnitScope()`: la tabla es global de plataforma y no
 * tiene `business_unit_id`. El mixin es fail-open sin TenantContext. Toda
 * resolución de comprobante va encadenada al pago — nunca `BillingTaxReceipt.find(id)`
 * a secas.
 *
 * La columna generada `billing_tax_receipt_is_live` no se declara: MySQL rechaza
 * escrituras sobre ella. El UNIQUE (pago, is_live) garantiza un vivo por pago.
 */
export default class BillingTaxReceipt extends BaseModel {
  static table = 'billing_tax_receipts'

  @column({ isPrimary: true, columnName: 'billing_tax_receipt_id' })
  declare billingTaxReceiptId: number

  @column({ columnName: 'billing_payment_id' })
  declare billingPaymentId: number

  @column({ columnName: 'billing_subscription_id' })
  declare billingSubscriptionId: number

  /** Folio fiscal. UNIQUE global, incluidos los cancelados. */
  @column({ columnName: 'billing_tax_receipt_uuid' })
  declare uuid: string

  @column({ columnName: 'billing_tax_receipt_series' })
  declare series: string | null

  @column({ columnName: 'billing_tax_receipt_folio' })
  declare folio: string | null

  @column.dateTime({ columnName: 'billing_tax_receipt_stamped_at' })
  declare stampedAt: DateTime

  @column({ columnName: 'billing_tax_receipt_status' })
  declare status: BillingTaxReceiptStatus

  @column({ columnName: 'billing_tax_receipt_issuer' })
  declare issuer: string

  @column({ columnName: 'billing_tax_receipt_cancellation_reason_code' })
  declare cancellationReasonCode: string | null

  @column.dateTime({ columnName: 'billing_tax_receipt_cancelled_at' })
  declare cancelledAt: DateTime | null

  @column({ columnName: 'billing_tax_receipt_substitute_uuid' })
  declare substituteUuid: string | null

  /**
   * RFC del receptor congelado al registrar (snapshot). Cifrado AES en reposo.
   * `serializeAs: null` es deliberado y NO se quita: el RFC sale del API únicamente
   * porque un DTO lo pone a mano, nunca por serialización del modelo. El precedente
   * `tenant_billing_profile.ts:31-46` omite esta línea; es un defecto vivo del que
   * este modelo no hereda.
   */
  @column({
    serializeAs: null,
    columnName: 'billing_tax_receipt_rfc',
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) {
        return null
      }
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
  declare rfc: string | null

  @column({ columnName: 'billing_tax_receipt_legal_name' })
  declare legalName: string

  @column({ columnName: 'billing_tax_receipt_postal_code' })
  declare postalCode: string | null

  @column({ columnName: 'billing_tax_receipt_tax_regime_code' })
  declare taxRegimeCode: string | null

  @column({ columnName: 'billing_tax_receipt_cfdi_use_code' })
  declare cfdiUseCode: string | null

  @column({ columnName: 'billing_tax_receipt_subtotal_cents' })
  declare subtotalCents: number

  @column({ columnName: 'billing_tax_receipt_discount_amount_cents' })
  declare discountAmountCents: number

  @column({ columnName: 'billing_tax_receipt_tax_amount_cents' })
  declare taxAmountCents: number

  @column({ columnName: 'billing_tax_receipt_total_cents' })
  declare totalCents: number

  @column({ columnName: 'billing_tax_receipt_tax_rate' })
  declare taxRate: number

  @column({ columnName: 'billing_tax_receipt_xml_path' })
  declare xmlPath: string | null

  @column({ columnName: 'billing_tax_receipt_xml_mime' })
  declare xmlMime: string | null

  @column({ columnName: 'billing_tax_receipt_pdf_path' })
  declare pdfPath: string | null

  @column({ columnName: 'billing_tax_receipt_pdf_mime' })
  declare pdfMime: string | null

  @column.dateTime({ columnName: 'billing_tax_receipt_created_at', autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'billing_tax_receipt_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @belongsTo(() => BillingPayment, { foreignKey: 'billingPaymentId' })
  declare payment: BelongsTo<typeof BillingPayment>

  @belongsTo(() => BillingSubscription, { foreignKey: 'billingSubscriptionId' })
  declare subscription: BelongsTo<typeof BillingSubscription>

  @belongsTo(() => SatCancellationReason, {
    foreignKey: 'cancellationReasonCode',
    localKey: 'satCancellationReasonCode',
  })
  declare cancellationReason: BelongsTo<typeof SatCancellationReason>
}

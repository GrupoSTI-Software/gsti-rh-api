import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Comprobante fiscal (CFDI) de una membresía (USRH1788288461952).
 *
 * Un comprobante vivo por pago vía la columna generada `billing_tax_receipt_is_live`
 * y el UNIQUE (billing_payment_id, billing_tax_receipt_is_live). A diferencia de
 * `tenant_billing_profiles`, la condición de "vivo" es el ESTADO, no el soft delete:
 * un comprobante cancelado no se borra, cambia de estado y se conserva.
 * El RFC del receptor se almacena cifrado; sin huella buscable (nadie busca por RFC).
 */
export default class extends BaseSchema {
  protected tableName = 'billing_tax_receipts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('billing_tax_receipt_id').notNullable()

      table
        .bigInteger('billing_payment_id')
        .unsigned()
        .notNullable()
        .references('billing_payment_id')
        .inTable('billing_payments')
        .onDelete('RESTRICT')

      table
        .bigInteger('billing_subscription_id')
        .unsigned()
        .notNullable()
        .references('billing_subscription_id')
        .inTable('billing_subscriptions')
        .onDelete('RESTRICT')

      table.string('billing_tax_receipt_uuid', 36).notNullable()
      table.string('billing_tax_receipt_series', 25).nullable()
      table.string('billing_tax_receipt_folio', 40).nullable()
      table.dateTime('billing_tax_receipt_stamped_at').notNullable()

      table
        .enum('billing_tax_receipt_status', ['issued', 'cancelled', 'substituted'])
        .notNullable()
        .defaultTo('issued')

      table.string('billing_tax_receipt_issuer', 20).notNullable().defaultTo('odoo')

      table
        .string('billing_tax_receipt_cancellation_reason_code', 2)
        .nullable()
        .references('sat_cancellation_reason_code')
        .inTable('sat_cancellation_reasons')
        .withKeyName('fk_btr_cancellation_reason')
        .onDelete('RESTRICT')

      table.dateTime('billing_tax_receipt_cancelled_at').nullable()
      // Sin FK: el sustituto normalmente todavía no existe en la plataforma.
      table.string('billing_tax_receipt_substitute_uuid', 36).nullable()

      // Snapshot congelado del receptor. Nulabilidad espejo de tenant_billing_profiles:
      // la regla dura de "perfil completo" vive en el servicio de alta, no en la columna.
      table.string('billing_tax_receipt_rfc', 191).nullable()
      table.string('billing_tax_receipt_legal_name', 250).notNullable()
      table.string('billing_tax_receipt_postal_code', 5).nullable()
      table.string('billing_tax_receipt_tax_regime_code', 3).nullable()
      table.string('billing_tax_receipt_cfdi_use_code', 4).nullable()

      table.integer('billing_tax_receipt_subtotal_cents').unsigned().notNullable()
      table.integer('billing_tax_receipt_discount_amount_cents').unsigned().notNullable()
      table.integer('billing_tax_receipt_tax_amount_cents').unsigned().notNullable()
      table.integer('billing_tax_receipt_total_cents').unsigned().notNullable()
      table.decimal('billing_tax_receipt_tax_rate', 5, 4).notNullable()

      // Archivos del acuse: los llena la rebanada 3; la tabla nace completa.
      table.string('billing_tax_receipt_xml_path', 512).nullable()
      table.string('billing_tax_receipt_xml_mime', 100).nullable()
      table.string('billing_tax_receipt_pdf_path', 512).nullable()
      table.string('billing_tax_receipt_pdf_mime', 100).nullable()

      table.timestamp('billing_tax_receipt_created_at').notNullable().defaultTo(this.now())
      table.timestamp('billing_tax_receipt_updated_at').nullable()
      // Sin deleted_at: un comprobante no se borra, cambia de estado.

      table.unique(['billing_tax_receipt_uuid'], 'billing_tax_receipts_uuid_unique')
      table.index(['billing_subscription_id'], 'idx_billing_tax_receipts_subscription')
    })

    // FUERA de createTable: Knex no expone generatedAs para columnas virtuales
    // en MySQL. La condición es el ESTADO, no deleted_at (R-1).
    this.schema.raw(`
      ALTER TABLE \`billing_tax_receipts\`
      ADD COLUMN \`billing_tax_receipt_is_live\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN \`billing_tax_receipt_status\` = 'issued' THEN 1 ELSE NULL END)
        VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`billing_tax_receipts\`
      ADD UNIQUE KEY \`billing_tax_receipts_payment_live_unique\`
        (\`billing_payment_id\`, \`billing_tax_receipt_is_live\`)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pagos con método tarjeta y referencias Stripe para asentamiento del proveedor
 * (USRH1790724549115). Sin filas `card` el rollback es reversible.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_payments'

  async up() {
    await this.schema.raw(
      "ALTER TABLE billing_payments MODIFY billing_payment_method ENUM('transfer','cash','other','card') NOT NULL"
    )

    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('billing_payment_provider_invoice_id', 191)
        .nullable()
        .after('billing_payment_provider')
      table
        .string('billing_payment_provider_payment_ref', 191)
        .nullable()
        .after('billing_payment_provider_invoice_id')
      table
        .string('billing_payment_provider_event_id', 191)
        .nullable()
        .after('billing_payment_provider_payment_ref')

      table.unique(['billing_payment_provider_invoice_id'], {
        indexName: 'uq_billing_payment_provider_invoice',
      })
    })
  }

  async down() {
    const result = await this.db.rawQuery(
      "SELECT COUNT(*) AS card_count FROM billing_payments WHERE billing_payment_method = 'card'"
    )
    const rows = result[0] as Array<{ card_count: number | string }>
    const cardCount = Number(rows[0]?.card_count ?? 0)
    if (cardCount > 0) {
      throw new Error(
        'No se puede revertir: existen pagos con método card. Elimínalos antes del rollback.'
      )
    }

    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['billing_payment_provider_invoice_id'], 'uq_billing_payment_provider_invoice')
      table.dropColumn('billing_payment_provider_event_id')
      table.dropColumn('billing_payment_provider_payment_ref')
      table.dropColumn('billing_payment_provider_invoice_id')
    })

    await this.schema.raw(
      "ALTER TABLE billing_payments MODIFY billing_payment_method ENUM('transfer','cash','other') NOT NULL"
    )
  }
}

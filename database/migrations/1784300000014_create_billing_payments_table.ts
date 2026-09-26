import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Histórico de pagos manuales de suscripción (append-only / inmutable).
 *
 * billing_payment_amount_cents es la primera columna del módulo billing
 * en centavos (int unsigned). El resto del módulo (billing_plan_prices,
 * billing_subscriptions) aún usa decimal(12,2) en pesos y será migrado
 * al mismo estándar en un ticket posterior.
 */
export default class CreateBillingPaymentsTable extends BaseSchema {
  protected tableName = 'billing_payments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('billing_payment_id').unsigned().primary()

      table
        .bigInteger('billing_subscription_id')
        .unsigned()
        .notNullable()
        .references('billing_subscription_id')
        .inTable('billing_subscriptions')
        .onDelete('RESTRICT')

      // Monto pagado en centavos (primera columna billing en centavos;
      // el resto del módulo se migrará al mismo estándar en ticket posterior)
      table.integer('billing_payment_amount_cents').unsigned().notNullable()

      table
        .enum('billing_payment_method', ['transfer', 'cash', 'other'])
        .notNullable()

      table.string('billing_payment_reference', 191).nullable()

      // Key privada en S3 — NUNCA la URL pública. Descarga firmada en 04-05.
      table.string('billing_payment_receipt_path', 512).nullable()
      table.string('billing_payment_receipt_mime', 100).nullable()

      // Reservado para reconciliación Stripe futura
      table.string('billing_payment_provider', 20).notNullable().defaultTo('manual')

      table.datetime('billing_payment_paid_at').notNullable()

      // Foto del avance de periodo que provocó este pago
      table.date('billing_payment_period_start').notNullable()
      table.date('billing_payment_period_end').notNullable()

      // Append-only: sin updated_at ni deleted_at (inmutable por diseño)
      table.timestamp('billing_payment_created_at').notNullable().defaultTo(this.now())

      table.index(
        ['billing_subscription_id', 'billing_payment_paid_at'],
        'idx_billing_payment_sub_paid_at'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

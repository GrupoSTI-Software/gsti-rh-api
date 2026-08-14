import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Solicitudes de cambio de la cantidad contratada de una suscripción
 * (USRH1786107870850 escribe `increase`; USRH1786107870853 escribe `decrease`).
 *
 * Convención monetaria MIXTA a propósito: los importes del periodo van en pesos
 * DECIMAL para casar con billing_subscriptions (su destino al aplicarse), y el
 * adeudo prorrateado va en centavos INT para casar con billing_payments (donde
 * se cobra). Misma deuda declarada en 1784300000014_create_billing_payments_table.ts:6-9.
 *
 * "Un solo cambio vivo por suscripción" (estados pending_payment y scheduled) NO
 * se declara como UNIQUE parcial: MySQL no lo soporta. Es un invariante
 * transaccional del servicio (SELECT ... FOR UPDATE sobre la suscripción padre),
 * mismo patrón que el candado de suscripción viva en billing_subscription_service.ts:241-246.
 * El índice de abajo solo da soporte de lectura a esa verificación.
 */
export default class CreateBillingSubscriptionChangesTable extends BaseSchema {
  protected tableName = 'billing_subscription_changes'

  async up() {
    // Si una ejecución previa falló a medias (p. ej. nombre de FK demasiado largo),
    // la tabla puede existir sin estar registrada en adonis_schema.
    this.schema.dropTableIfExists(this.tableName)

    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('billing_subscription_change_id').unsigned().primary()

      table
        .bigInteger('billing_subscription_id')
        .unsigned()
        .notNullable()
        .references('billing_subscription_id')
        .inTable('billing_subscriptions')
        .withKeyName('fk_bsc_billing_subscription_id')
        .onDelete('RESTRICT')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .withKeyName('fk_bsc_business_unit_id')
        .onDelete('RESTRICT')

      table
        .enum('billing_subscription_change_type', ['increase', 'decrease'])
        .notNullable()

      table
        .enum('billing_subscription_change_status', [
          'pending_payment',
          'scheduled',
          'applied',
          'canceled',
          'not_applicable',
        ])
        .notNullable()

      table.integer('billing_subscription_change_previous_employees').unsigned().notNullable()
      table.integer('billing_subscription_change_new_employees').unsigned().notNullable()

      table.decimal('billing_subscription_change_unit_amount', 10, 2).notNullable()
      table.decimal('billing_subscription_change_discount_percent', 5, 2).notNullable().defaultTo(0)
      table.decimal('billing_subscription_change_tax_rate', 5, 4).notNullable().defaultTo(0.16)
      table.decimal('billing_subscription_change_subtotal', 12, 2).notNullable()
      table.decimal('billing_subscription_change_tax_amount', 12, 2).notNullable()
      table.decimal('billing_subscription_change_total', 12, 2).notNullable()

      table
        .integer('billing_subscription_change_prorated_amount_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)

      table.datetime('billing_subscription_change_effective_at').nullable()
      table.datetime('billing_subscription_change_applied_at').nullable()

      table
        .bigInteger('billing_subscription_change_billing_payment_id')
        .unsigned()
        .nullable()
        .references('billing_payment_id')
        .inTable('billing_payments')
        .withKeyName('fk_bsc_billing_payment_id')
        .onDelete('RESTRICT')

      table.string('billing_subscription_change_not_applicable_reason', 191).nullable()

      table.timestamp('billing_subscription_change_created_at').notNullable().defaultTo(this.now())
      table.timestamp('billing_subscription_change_updated_at').nullable()
      table.timestamp('billing_subscription_change_deleted_at').nullable()

      table.index(
        ['billing_subscription_id', 'billing_subscription_change_status'],
        'idx_billing_subscription_change_live'
      )
      table.index(
        ['billing_subscription_change_effective_at'],
        'idx_billing_subscription_change_effective_at'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

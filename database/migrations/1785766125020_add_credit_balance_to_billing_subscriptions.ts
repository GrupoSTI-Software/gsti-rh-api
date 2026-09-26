import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Saldo a favor de la suscripción (USRH1785962095095).
 *
 * Vive como columna denormalizada (decisión de diseño §10 del spec): lectura
 * O(1), escritura dentro de la misma transacción del pago con `.forUpdate()`.
 * Cada pago guarda su propio `credit_applied`/`credit_balance_after`, así que
 * la serie histórica se reconstruye desde `billing_payments` (append-only)
 * sin necesitar un ledger separado.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('billing_subscription_credit_balance_cents')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('billing_subscription_contracted_total')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_subscription_credit_balance_cents')
    })
  }
}

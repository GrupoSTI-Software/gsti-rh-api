import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddLastPaymentFailureToBillingSubscriptionsTable extends BaseSchema {
  protected tableName = 'billing_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .timestamp('billing_subscription_last_payment_failed_at')
        .nullable()
        .defaultTo(null)
        .after('billing_subscription_canceled_at')
      table
        .string('billing_subscription_last_payment_failure_reason', 40)
        .nullable()
        .defaultTo(null)
        .after('billing_subscription_last_payment_failed_at')
      table
        .string('billing_subscription_last_payment_failure_invoice_ref', 191)
        .nullable()
        .defaultTo(null)
        .after('billing_subscription_last_payment_failure_reason')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_subscription_last_payment_failure_invoice_ref')
      table.dropColumn('billing_subscription_last_payment_failure_reason')
      table.dropColumn('billing_subscription_last_payment_failed_at')
    })
  }
}

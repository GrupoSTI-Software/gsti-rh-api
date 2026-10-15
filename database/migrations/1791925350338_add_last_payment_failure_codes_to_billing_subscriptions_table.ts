import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddLastPaymentFailureCodesToBillingSubscriptionsTable extends BaseSchema {
  protected tableName = 'billing_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('billing_subscription_last_payment_failure_code', 100)
        .nullable()
        .defaultTo(null)
        .after('billing_subscription_last_payment_failure_reason')
      table
        .string('billing_subscription_last_payment_failure_decline_code', 100)
        .nullable()
        .defaultTo(null)
        .after('billing_subscription_last_payment_failure_code')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_subscription_last_payment_failure_decline_code')
      table.dropColumn('billing_subscription_last_payment_failure_code')
    })
  }
}

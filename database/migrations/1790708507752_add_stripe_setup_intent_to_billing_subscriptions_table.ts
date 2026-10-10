import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1790708507752 — SetupIntent en curso para cambiar la tarjeta de cobro.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('billing_subscription_stripe_setup_intent_id', 191)
        .nullable()
        .defaultTo(null)
        .after('billing_subscription_stripe_subscription_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_subscription_stripe_setup_intent_id')
    })
  }
}

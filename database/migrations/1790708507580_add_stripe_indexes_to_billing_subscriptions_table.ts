import { BaseSchema } from '@adonisjs/lucid/schema'

/** Índices Stripe en suscripciones (USRH1790708507579 · Regla 11). */
export default class extends BaseSchema {
  protected tableName = 'billing_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(
        ['billing_subscription_stripe_subscription_id'],
        'uq_billing_subscription_stripe_subscription'
      )
      table.index(
        ['billing_subscription_stripe_customer_id'],
        'idx_billing_subscription_stripe_customer'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(
        ['billing_subscription_stripe_subscription_id'],
        'uq_billing_subscription_stripe_subscription'
      )
      table.dropIndex(
        ['billing_subscription_stripe_customer_id'],
        'idx_billing_subscription_stripe_customer'
      )
    })
  }
}

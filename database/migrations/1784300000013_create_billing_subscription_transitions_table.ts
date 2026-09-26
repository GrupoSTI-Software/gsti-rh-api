import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateBillingSubscriptionTransitionsTable extends BaseSchema {
  protected tableName = 'billing_subscription_transitions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('billing_subscription_transition_id').unsigned().primary()

      table
        .bigInteger('billing_subscription_id')
        .unsigned()
        .notNullable()
        .references('billing_subscription_id')
        .inTable('billing_subscriptions')
        .onDelete('RESTRICT')

      table.string('billing_subscription_transition_from', 20).notNullable()
      table.string('billing_subscription_transition_to', 20).notNullable()

      // Motivo de la transición: trial_expired_uncovered | trial_expired_covered | period_expired
      table.string('billing_subscription_transition_reason', 40).notNullable()

      table.date('billing_subscription_transition_cut_date').notNullable()

      table.timestamp('billing_subscription_transition_created_at').notNullable().defaultTo(this.now())

      // Candado de idempotencia: una sola transición por suscripción por fecha de corte
      table.unique(
        ['billing_subscription_id', 'billing_subscription_transition_cut_date'],
        { indexName: 'uq_billing_sub_transition_cut' }
      )
      table.index(['billing_subscription_transition_cut_date'], 'idx_billing_sub_transition_cut_date')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

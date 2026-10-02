import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora de avisos del proveedor de cobro (USRH1790708507579).
 * Plataforma, sin payload ni PII.
 */
export default class extends BaseSchema {
  protected tableName = 'billing_provider_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('billing_provider_event_id').notNullable()

      table.string('billing_provider_event_provider', 20).notNullable()
      table.string('billing_provider_event_external_id', 191).notNullable()
      table.string('billing_provider_event_type', 100).notNullable()
      table.string('billing_provider_event_object_id', 191).nullable()
      table.string('billing_provider_event_object_type', 50).nullable()
      table.boolean('billing_provider_event_livemode').notNullable()
      table.string('billing_provider_event_status', 20).notNullable().defaultTo('received')
      table.integer('billing_provider_event_attempts').unsigned().notNullable().defaultTo(0)
      table.string('billing_provider_event_last_error_code', 100).nullable()

      table
        .bigInteger('billing_subscription_id')
        .unsigned()
        .nullable()
        .references('billing_subscription_id')
        .inTable('billing_subscriptions')
        .onDelete('SET NULL')

      table.timestamp('billing_provider_event_provider_created_at').notNullable()
      table.timestamp('billing_provider_event_received_at').notNullable().defaultTo(this.now())
      table.timestamp('billing_provider_event_processed_at').nullable()
      table.timestamp('updated_at').nullable()

      table.unique(
        ['billing_provider_event_provider', 'billing_provider_event_external_id'],
        'uq_billing_provider_event_external'
      )
      table.index(
        ['billing_provider_event_provider', 'billing_provider_event_object_id'],
        'idx_billing_provider_event_object'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddProviderOriginToBillingSubscriptionTransitionsTable extends BaseSchema {
  protected tableName = 'billing_subscription_transitions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('billing_subscription_transition_origin', 20)
        .notNullable()
        .defaultTo('clock')
        .after('billing_subscription_transition_reason')
      table
        .string('billing_subscription_transition_origin_key', 191)
        .notNullable()
        .defaultTo('clock')
        .after('billing_subscription_transition_origin')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.unique(
        [
          'billing_subscription_id',
          'billing_subscription_transition_cut_date',
          'billing_subscription_transition_origin_key',
        ],
        { indexName: 'uq_billing_sub_transition_cut_origin' }
      )
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(
        ['billing_subscription_id', 'billing_subscription_transition_cut_date'],
        'uq_billing_sub_transition_cut'
      )
    })
  }

  async down() {
    const existingProvider = await this.db
      .from(this.tableName)
      .where('billing_subscription_transition_origin', 'provider')
      .first()
    if (existingProvider !== undefined && existingProvider !== null) {
      throw new Error('No se puede revertir: hay transiciones con origen proveedor')
    }

    this.schema.alterTable(this.tableName, (table) => {
      table.unique(
        ['billing_subscription_id', 'billing_subscription_transition_cut_date'],
        { indexName: 'uq_billing_sub_transition_cut' }
      )
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(
        [
          'billing_subscription_id',
          'billing_subscription_transition_cut_date',
          'billing_subscription_transition_origin_key',
        ],
        'uq_billing_sub_transition_cut_origin'
      )
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('billing_subscription_transition_origin_key')
      table.dropColumn('billing_subscription_transition_origin')
    })
  }
}

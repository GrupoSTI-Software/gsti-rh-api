import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'onboarding_flows'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('onboarding_flow_id').notNullable()
      table.string('onboarding_flow_slug', 100).notNullable()
      table.string('onboarding_flow_name', 255).notNullable()
      table.text('onboarding_flow_description').nullable()
      table.boolean('onboarding_flow_active').notNullable().defaultTo(true)
      table.tinyint('onboarding_flow_order').unsigned().notNullable().defaultTo(1)

      table.timestamp('onboarding_flow_created_at').notNullable()
      table.timestamp('onboarding_flow_updated_at').nullable()
      table.timestamp('onboarding_flow_deleted_at').nullable()

      table.unique(['onboarding_flow_slug'], { indexName: 'onboarding_flows_slug_unique' })
      table.index(['onboarding_flow_active', 'onboarding_flow_order'], 'onboarding_flows_active_order_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

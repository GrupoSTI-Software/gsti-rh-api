import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'supply_value_histories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('supply_value_history_id')
      table.integer('supply_id').unsigned()
        .references('supply_id')
        .inTable('supplies')
        .notNullable()
        .onDelete('cascade')
      table.decimal('supply_value_history_cost', 14, 2).unsigned().notNullable()
      table.decimal('supply_value_history_current_value', 14, 2).unsigned().notNullable()
      table.text('supply_value_history_notes').nullable()
      table.timestamp('supply_value_history_created_at').notNullable()
      table.timestamp('supply_value_history_updated_at').nullable()
      table.timestamp('supply_value_history_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

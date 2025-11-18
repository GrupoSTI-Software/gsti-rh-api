import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'supplie_caracteristic_values'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('supplie_caracteristic_value_id')
      table.integer('supplie_caracteristic_id').unsigned()
        .references('supplie_caracteristic_id')
        .inTable('supplie_caracteristics')
        .notNullable()
        .onDelete('cascade')
      table.integer('supplie_id').unsigned()
        .references('supply_id')
        .inTable('supplies')
        .notNullable()
        .onDelete('cascade')
      table.text('supplie_caracteristic_value_value').notNullable()
      table.timestamp('supplie_caracteristic_value_created_at').notNullable()
      table.timestamp('supplie_caracteristic_value_updated_at').nullable()
      table.timestamp('supplie_caracteristic_value_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

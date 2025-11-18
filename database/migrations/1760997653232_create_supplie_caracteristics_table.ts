import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'supplie_caracteristics'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('supplie_caracteristic_id')
      table.integer('supply_type_id').unsigned()
        .references('supply_type_id')
        .inTable('supply_types')
        .notNullable()
        .onDelete('cascade')
      table.string('supplie_caracteristic_name', 100).notNullable()
      table.enum('supplie_caracteristic_type', ['text', 'number', 'date', 'boolean']).notNullable()
      table.timestamp('supplie_caracteristic_created_at').notNullable()
      table.timestamp('supplie_caracteristic_updated_at').nullable()
      table.timestamp('supplie_caracteristic_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

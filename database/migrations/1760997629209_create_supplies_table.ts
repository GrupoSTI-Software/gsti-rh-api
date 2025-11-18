import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'supplies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('supply_id')
      table.integer('supply_file_number').unsigned().notNullable().unique()
      table.string('supply_name').notNullable()
      table.text('supply_description').nullable()
      table.integer('supply_type_id').unsigned()
        .references('supply_type_id')
        .inTable('supply_types')
        .notNullable()
        .onDelete('cascade')
      table.enum('supply_status', ['active', 'inactive', 'lost', 'damaged']).notNullable().defaultTo('active')
      table.text('supply_deactivation_reason').nullable()
      table.date('supply_deactivation_date').nullable()
      table.timestamp('supply_created_at').notNullable()
      table.timestamp('supply_updated_at').nullable()
      table.timestamp('supply_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

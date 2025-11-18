import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'supply_types'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('supply_type_id')
      table.string('supply_type_name', 100).notNullable()
      table.text('supply_type_description').nullable()
      table.text('supply_type_identifier').nullable()
      table.string('supply_type_slug', 250).notNullable()
      table.timestamp('supply_type_created_at').notNullable()
      table.timestamp('supply_type_updated_at').nullable()
      table.timestamp('supply_type_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_specific_functions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_specific_function_id')

      table.integer('position_id').unsigned().references('positions.position_id')
      table.text('position_specific_function_name').notNullable()
      table.string('position_specific_function_type', 100).notNullable()

      table.timestamp('position_specific_function_created_at').notNullable()
      table.timestamp('position_specific_function_updated_at').nullable()
      table.timestamp('position_specific_function_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
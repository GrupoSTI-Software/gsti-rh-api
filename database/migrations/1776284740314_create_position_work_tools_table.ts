import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_work_tools'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_work_tool_id')

      table.integer('position_id').unsigned().references('positions.position_id')

      table.string('position_work_tool_name', 255).notNullable()

      table.timestamp('position_work_tool_created_at').notNullable()
      table.timestamp('position_work_tool_updated_at').nullable()
      table.timestamp('position_work_tool_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

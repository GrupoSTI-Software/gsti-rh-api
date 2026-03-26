import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_approval_histories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_approval_history_id')
      table.integer('position_id').unsigned().references('positions.position_id')
      table.timestamp('position_approval_history_date').notNullable()
      
      table.timestamp('position_approval_history_created_at').notNullable()
      table.timestamp('position_approval_history_updated_at').nullable()
      table.timestamp('position_approval_history_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
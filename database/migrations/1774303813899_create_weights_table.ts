import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'weights'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('weight_id')

      table.string('weight_name', 100).notNullable()
      table.integer('weight_value').notNullable()

      table.timestamp('weight_created_at').notNullable()
      table.timestamp('weight_updated_at').nullable()
      table.timestamp('weight_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
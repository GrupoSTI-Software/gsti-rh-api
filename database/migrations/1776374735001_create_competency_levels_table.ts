import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'competency_levels'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('competency_level_id')

      table.string('competency_level_code', 50).notNullable().unique()
      table.string('competency_level_name', 100).notNullable()
      table.integer('competency_level_order').notNullable().defaultTo(0)

      table.timestamp('competency_level_created_at').notNullable()
      table.timestamp('competency_level_updated_at').nullable()
      table.timestamp('competency_level_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

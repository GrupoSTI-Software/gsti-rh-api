import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'certification_categories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('certification_category_id').notNullable()
      table.string('certification_category_key', 64).notNullable().unique()
      table.string('certification_category_name', 120).notNullable()
      table.integer('certification_category_display_order').unsigned().notNullable().defaultTo(0)
      table.tinyint('certification_category_is_active').unsigned().notNullable().defaultTo(1)
      table.timestamp('certification_category_created_at').notNullable()
      table.timestamp('certification_category_updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

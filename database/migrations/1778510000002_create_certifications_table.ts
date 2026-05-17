import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'certifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('certification_id').notNullable()
      table
        .integer('category_id')
        .unsigned()
        .notNullable()
        .references('certification_category_id')
        .inTable('certification_categories')
        .onDelete('RESTRICT')
      table.string('certification_name', 200).notNullable()
      table.tinyint('is_external').unsigned().notNullable().defaultTo(1)
      table.string('external_url', 2048).nullable()
      table.integer('renewal_period_days').unsigned().nullable()
      table.timestamp('certification_created_at').notNullable()
      table.timestamp('certification_updated_at').nullable()

      table.unique(['category_id', 'certification_name'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'labor_law_hours'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('labor_law_hours_id')
      table.decimal('labor_law_hours_hours_per_week', 5, 2).notNullable().defaultTo(48.00)
      table.tinyint('labor_law_hours_active').notNullable().defaultTo(1)
      table.date('labor_law_hours_apply_since').notNullable()
      table.text('labor_law_hours_description').nullable()

      table.timestamp('labor_law_hours_created_at').notNullable()
      table.timestamp('labor_law_hours_updated_at').notNullable()
      table.timestamp('labor_law_hours_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

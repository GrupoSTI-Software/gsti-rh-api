import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_salary_ranges'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_salary_range_id').notNullable()

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table
        .integer('position_id')
        .unsigned()
        .notNullable()
        .references('position_id')
        .inTable('positions')
        .onDelete('RESTRICT')

      // Montos cifrados en reposo (AES-256-CBC via APP_KEY) — LFPDPPP
      table.text('min_salary_daily').notNullable()
      table.text('max_salary_daily').notNullable()

      table.date('valid_from').notNullable()
      table.date('valid_to').nullable()

      table
        .integer('created_by')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.timestamp('position_salary_range_created_at').notNullable()
      table.timestamp('position_salary_range_updated_at').nullable()
      table.timestamp('position_salary_range_deleted_at').nullable()

      // Índice compuesto para búsquedas por razón social + puesto + vigencia
      table.index(['business_unit_id', 'position_id', 'valid_from'], 'idx_psr_business_position_valid_from')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

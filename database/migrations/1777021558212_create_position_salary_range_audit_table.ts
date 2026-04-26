import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'position_salary_range_audit'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('position_salary_range_audit_id').notNullable()

      table
        .integer('range_id')
        .unsigned()
        .notNullable()
        .references('position_salary_range_id')
        .inTable('position_salary_ranges')
        .onDelete('RESTRICT')

      table.enum('action', ['create', 'update', 'close']).notNullable()

      // Valores anteriores cifrados (nullable en acción 'create')
      table.text('old_min_salary_daily').nullable()
      table.text('old_max_salary_daily').nullable()

      // Valores nuevos cifrados (nullable en acción 'close')
      table.text('new_min_salary_daily').nullable()
      table.text('new_max_salary_daily').nullable()

      table
        .integer('actor_id')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.text('reason').nullable()

      table.timestamp('position_salary_range_audit_created_at').notNullable()
      table.timestamp('position_salary_range_audit_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_salary_history'

  async up() {
    const existing = await this.db.rawQuery(
      `SELECT COUNT(*) as count FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [this.tableName]
    )
    if (Number(existing[0]?.[0]?.count ?? 0) > 0) {
      return
    }

    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_salary_history_id')
      table
        .integer('employee_id')
        .unsigned()
        .notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')
        .withKeyName('employee_salary_history_employee_id_foreign')
      table.text('salary_daily').notNullable()
      table.date('valid_from').notNullable()
      table.date('valid_to').nullable()
      table
        .integer('changed_by')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')
        .withKeyName('employee_salary_history_changed_by_foreign')
      table.text('reason').nullable()
      table.timestamp('employee_salary_history_created_at').notNullable().defaultTo(this.now())
      table.timestamp('employee_salary_history_deleted_at').nullable()
      table.index(['employee_id', 'valid_from'], 'idx_employee_salary_history_employee_valid_from')
    })
  }

  async down() {
    await this.db.rawQuery('SET FOREIGN_KEY_CHECKS=0')
    await this.schema.dropTableIfExists(this.tableName)
    await this.db.rawQuery('SET FOREIGN_KEY_CHECKS=1')
  }
}

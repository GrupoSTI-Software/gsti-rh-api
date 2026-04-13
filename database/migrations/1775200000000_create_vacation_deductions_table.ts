import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'vacation_deductions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('vacation_deduction_id')
      table
        .integer('employee_id')
        .unsigned()
        .notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')
      table
        .integer('vacation_setting_id')
        .unsigned()
        .notNullable()
        .references('vacation_setting_id')
        .inTable('vacation_settings')
        .onDelete('CASCADE')
      table.integer('vacation_deduction_days').unsigned().notNullable()
      table.text('vacation_deduction_description').notNullable()
      table.timestamp('vacation_deduction_created_at').notNullable()
      table.timestamp('vacation_deduction_updated_at').nullable()
      table.timestamp('vacation_deduction_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

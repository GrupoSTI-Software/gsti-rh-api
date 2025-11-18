import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_settings_employees'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('system_setting_employee_id')
      table
        .integer('system_setting_id')
        .unsigned()
        .references('system_setting_id')
        .inTable('system_settings')
        .onDelete('CASCADE')
        .notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.integer('employee_limit').unsigned().nullable()
      table.timestamp('system_setting_employee_deleted_at').nullable()
      table.timestamp('system_setting_employee_created_at')
      table.timestamp('system_setting_employee_updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
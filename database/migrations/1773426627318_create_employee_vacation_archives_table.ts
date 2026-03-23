import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_vacation_archives'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_vacation_archive_id')
      table.integer('employee_id').unsigned().notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('cascade')
      table.integer('vacation_setting_id').unsigned().notNullable()
        .references('vacation_setting_id')
        .inTable('vacation_settings')
        .withKeyName('fk_vac_setting_archive')
        .onDelete('cascade')
      table.timestamp('employee_vacation_archive_created_at').notNullable()
      table.timestamp('employee_vacation_archive_updated_at').nullable()
      table.timestamp('employee_vacation_archive_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['employee_id'])
      table.dropForeign(['vacation_setting_id'], 'fk_vac_setting_archive')
    })

    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_vacation_archive_contents'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_vacation_archive_content_id')
      table
        .integer('employee_vacation_archive_id')
        .unsigned()
        .notNullable()
        .references('employee_vacation_archive_id')
        .inTable('employee_vacation_archives')
        .withKeyName('fk_emp_vac_archive')
        .onDelete('cascade')
      table.text('employee_vacation_archive_content_description').nullable()
      table.string('employee_vacation_archive_content_file', 250).nullable()
      table.boolean('employee_vacation_archive_content_active').notNullable().defaultTo(true)
      table.timestamp('employee_vacation_archive_content_created_at').notNullable()
      table.timestamp('employee_vacation_archive_content_updated_at').nullable()
      table.timestamp('employee_vacation_archive_content_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['employee_vacation_archive_id'], 'fk_emp_vac_archive')
    })

    this.schema.dropTable(this.tableName)
  }
}

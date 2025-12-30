import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_proceeding_files_types'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_proceeding_file_type_id')
      table.integer('employee_id')
        .references('employee_id')
        .inTable('employees')
        .unsigned()
        .notNullable()
        .onDelete('cascade')
        .onUpdate('cascade')
      table.integer('proceeding_file_type_id')
        .notNullable()
        .references('proceeding_file_type_id')
        .inTable('proceeding_file_types')
        .unsigned()
        .notNullable()
        .onDelete('cascade')
        .onUpdate('cascade')
      table.timestamp('employee_proceeding_file_type_created_at').notNullable()
      table.timestamp('employee_proceeding_file_type_updated_at').nullable()
      table.timestamp('employee_proceeding_file_type_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

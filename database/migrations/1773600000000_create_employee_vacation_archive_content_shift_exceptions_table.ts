import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pivote: vincula contenidos (evidencias/archivos) con excepciones de turno tipo vacation.
 * Cada evidencia puede asociarse a varias excepciones; cada excepción puede tener varias evidencias.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_vacation_archive_content_shift_exceptions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_vacation_archive_content_shift_exception_id')
      table
        .integer('employee_vacation_archive_content_id')
        .unsigned()
        .notNullable()
        .references('employee_vacation_archive_content_id')
        .inTable('employee_vacation_archive_contents')
        .withKeyName('fk_content_shift_exception_content')
        .onDelete('cascade')
      table
        .integer('shift_exception_id')
        .unsigned()
        .notNullable()
        .references('shift_exception_id')
        .inTable('shift_exceptions')
        .withKeyName('fk_content_shift_exception_shift')
        .onDelete('cascade')
      table
        .timestamp('employee_vacation_archive_content_shift_exception_created_at')
        .notNullable()
        .defaultTo(this.now())
      table
        .timestamp('employee_vacation_archive_content_shift_exception_updated_at')
        .nullable()
        .defaultTo(this.now())

      table.unique(
        ['employee_vacation_archive_content_id', 'shift_exception_id'],
        'uq_content_shift_exception'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

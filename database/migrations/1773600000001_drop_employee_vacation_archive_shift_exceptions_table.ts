import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Elimina la pivote archivador <-> shift_exception.
 * Las excepciones de turno ahora se vinculan al contenido (evidencia), no al archivador.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_vacation_archive_shift_exceptions'

  async up() {
    this.schema.dropTableIfExists(this.tableName)
  }

  async down() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_vacation_archive_shift_exception_id')
      table
        .integer('employee_vacation_archive_id')
        .unsigned()
        .notNullable()
        .references('employee_vacation_archive_id')
        .inTable('employee_vacation_archives')
        .withKeyName('fk_archive_shift_exception_archive')
        .onDelete('cascade')
      table
        .integer('shift_exception_id')
        .unsigned()
        .notNullable()
        .references('shift_exception_id')
        .inTable('shift_exceptions')
        .withKeyName('fk_archive_shift_exception_shift')
        .onDelete('cascade')
      table.timestamp('employee_vacation_archive_shift_exception_created_at').notNullable()
      table.timestamp('employee_vacation_archive_shift_exception_updated_at').nullable()
      table.unique(['shift_exception_id'], 'uq_archive_shift_exception_shift_id')
    })
  }
}

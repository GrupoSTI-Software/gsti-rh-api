import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Añade valores por defecto a los timestamps de la pivote para que
 * los INSERT desde attach() (que solo envían los FK) no fallen.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_vacation_archive_content_shift_exceptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .timestamp('employee_vacation_archive_content_shift_exception_created_at')
        .defaultTo(this.now())
        .alter()
      table
        .timestamp('employee_vacation_archive_content_shift_exception_updated_at')
        .defaultTo(this.now())
        .alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('employee_vacation_archive_content_shift_exception_created_at').defaultTo(null).alter()
      table.timestamp('employee_vacation_archive_content_shift_exception_updated_at').defaultTo(null).alter()
    })
  }
}

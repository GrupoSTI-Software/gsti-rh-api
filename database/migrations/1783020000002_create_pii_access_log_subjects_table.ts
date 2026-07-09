import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tabla hija de titulares incluidos en un asiento agrupado de exportación.
 *
 * Guarda solo referencias `employee_id` (regla 2-bis); los nombres se resuelven
 * al consultar. Escritura append-only en la misma transacción del asiento padre.
 *
 * Ref: USRH1783029947540 — Registrar acceso a datos sensibles en exportaciones masivas.
 */
export default class extends BaseSchema {
  protected tableName = 'pii_access_log_subjects'

  protected wrapInTransaction = false

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('pii_access_log_subject_id').primary()

      table
        .bigInteger('pii_access_log_id')
        .unsigned()
        .notNullable()
        .references('pii_access_log_id')
        .inTable('pii_access_logs')
        .onDelete('RESTRICT')

      table
        .integer('employee_id')
        .unsigned()
        .notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table.timestamp('pii_access_log_subject_created_at').notNullable()
      table.timestamp('pii_access_log_subject_updated_at').nullable()
      table.timestamp('pii_access_log_subject_deleted_at').nullable()

      table.unique(
        ['pii_access_log_id', 'employee_id'],
        'pii_access_log_subjects_audit_employee_uniq'
      )
      table.index(['employee_id'], 'pii_access_log_subjects_employee_idx')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

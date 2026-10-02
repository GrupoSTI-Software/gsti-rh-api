import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Registro de los avisos de bloqueo de asistencia ya enviados: uno por
 * colaborador, tipo de bloqueo y mes. Sin él, cada intento de checar de un
 * colaborador bloqueado volvía a mandar el correo al colaborador y a todo
 * Capital Humano.
 */
export default class extends BaseSchema {
  protected tableName = 'attendance_lock_notification_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('attendance_lock_notification_log_id').notNullable()
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
      table
        .integer('employee_id')
        .unsigned()
        .notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')
      table.string('attendance_lock_notification_log_type', 20).notNullable()
      table.string('attendance_lock_notification_log_period', 7).notNullable()
      table.timestamp('attendance_lock_notification_log_created_at').notNullable()
      table.unique(
        [
          'employee_id',
          'attendance_lock_notification_log_type',
          'attendance_lock_notification_log_period',
        ],
        'uq_attendance_lock_notification_once_per_period'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

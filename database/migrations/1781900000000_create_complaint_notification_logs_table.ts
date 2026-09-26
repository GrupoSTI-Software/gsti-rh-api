import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora de notificaciones enviadas al crear una queja nueva (NOM-035).
 *
 * Registra cada intento de aviso a un administrador designado (`complaint.update`)
 * sin exponer identidad del denunciante. El fallo de envío no debe bloquear la
 * creación de la queja: se persiste con status `failed`.
 *
 * Convenciones del repo aplicadas:
 *  - Tabla plural `complaint_notification_logs`; columnas con prefijo
 *    `complaint_notification_log_`.
 *  - Solo `created_at` (sin `updated_at` ni soft delete): registro append-only.
 *  - Patrón alineado con `attendance_fault_hr_notification_logs` y
 *    `complaint_status_histories`.
 */
export default class extends BaseSchema {
  protected tableName = 'complaint_notification_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('complaint_notification_log_id').notNullable()

      table.integer('complaint_id').unsigned().notNullable()
      table.integer('recipient_user_id').unsigned().notNullable()

      table.string('complaint_notification_log_channel', 20).notNullable()
      table
        .enum('complaint_notification_log_status', ['sent', 'failed'])
        .notNullable()

      table.timestamp('complaint_notification_log_created_at').notNullable()

      table
        .foreign('complaint_id', 'fk_complaint_notif_log_complaint')
        .references('complaint_id')
        .inTable('complaints')
        .onDelete('CASCADE')

      table
        .foreign('recipient_user_id', 'fk_complaint_notif_log_recipient')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.index(['complaint_id'], 'idx_complaint_notif_log_complaint')
      table.index(['recipient_user_id'], 'idx_complaint_notif_log_recipient')
      table.index(
        ['complaint_id', 'complaint_notification_log_created_at'],
        'idx_complaint_notif_log_timeline'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

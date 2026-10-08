import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Constancia de cada intento de avisar a RH un reporte de evento traumático
 * de origen empleado. Solo se agrega: no hay updated_at ni baja lógica.
 * No guarda correo, nombre ni tipo; eso se deriva por las llaves foráneas.
 */
export default class extends BaseSchema {
  protected tableName = 'traumatic_event_report_notification_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('traumatic_event_report_notification_log_id').notNullable()

      table.integer('traumatic_event_report_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()
      table.integer('recipient_user_id').unsigned().notNullable()

      table.string('traumatic_event_report_notification_log_channel', 20).notNullable()
      table
        .enum('traumatic_event_report_notification_log_status', ['sent', 'failed'])
        .notNullable()

      table.timestamp('traumatic_event_report_notification_log_created_at').notNullable()

      table
        .foreign('traumatic_event_report_id', 'fk_ter_notif_log_report')
        .references('traumatic_event_report_id')
        .inTable('traumatic_event_reports')
        .onDelete('CASCADE')

      table
        .foreign('business_unit_id', 'fk_ter_notif_log_bu')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table
        .foreign('recipient_user_id', 'fk_ter_notif_log_recipient')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.index(['traumatic_event_report_id'], 'idx_ter_notif_log_report')
      table.index(['business_unit_id'], 'idx_ter_notif_log_bu')
      table.index(['recipient_user_id'], 'idx_ter_notif_log_recipient')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

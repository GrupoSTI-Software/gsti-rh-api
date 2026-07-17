import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora de envíos de la Política de Teletrabajo (difusión automática al
 * publicar y recordatorios masivos, USRH1783547655377). Espejo append-only
 * de `complaint_notification_logs`, con superset propio: destinatario =
 * empleado (no usuario BO), `business_unit_id` denormalizado, `type`
 * (difusión/recordatorio), atribución de quién disparó el envío y estatus
 * `skipped` — el sin-correo se registra visible, nunca se omite en silencio
 * (regla de negocio 5).
 *
 * Sin `updated_at` / `deleted_at`: append-only, una fila por intento; los
 * reintentos son filas nuevas, no correcciones.
 */
export default class extends BaseSchema {
  protected tableName = 'telework_policy_notification_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('telework_policy_notification_log_id').notNullable()

      table.integer('telework_policy_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.integer('business_unit_id').unsigned().notNullable()

      // Quién disparó la difusión/recordatorio (mandato de seguridad: atribución).
      // En v1 siempre el usuario del request; nullable por procesos futuros y
      // porque el usuario que publicó pudo haber sido eliminado (FK SET NULL).
      table.integer('triggered_by_user_id').unsigned().nullable()

      // 'email' (v1 único canal; string y no enum para no requerir ALTER cuando
      // llegue push, ESB-08-07-02-05/06).
      table.string('telework_policy_notification_log_channel', 20).notNullable()
      table
        .enum('telework_policy_notification_log_type', ['publication', 'reminder'])
        .notNullable()
      table
        .enum('telework_policy_notification_log_status', ['sent', 'failed', 'skipped'])
        .notNullable()

      // Detalle del fallo o motivo del skip ('sin-correo'); NULL en sent.
      table.string('telework_policy_notification_log_error', 500).nullable()

      table.timestamp('telework_policy_notification_log_created_at').notNullable()

      table
        .foreign('telework_policy_id', 'fk_twp_notif_log_policy')
        .references('telework_policy_id')
        .inTable('telework_policies')
        .onDelete('RESTRICT')

      table
        .foreign('employee_id', 'fk_twp_notif_log_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')

      table
        .foreign('business_unit_id', 'fk_twp_notif_log_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table
        .foreign('triggered_by_user_id', 'fk_twp_notif_log_triggered_by_user')
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table.index(
        ['telework_policy_id', 'employee_id'],
        'idx_twp_notif_log_policy_employee'
      )
      table.index(['employee_id'], 'idx_twp_notif_log_employee')
      table.index(
        ['business_unit_id', 'telework_policy_notification_log_created_at'],
        'idx_twp_notif_log_bu_timeline'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

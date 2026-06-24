import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Bitácora de notificaciones automáticas enviadas por el módulo de
 * periodos de lactancia. Sirve como mecanismo de **idempotencia** del
 * comando agendado `lactation:notify-expiring`: el `UNIQUE
 * (employee_lactation_period_id, lactation_notification_type)` impide
 * que el mismo periodo reciba dos veces el mismo aviso.
 *
 * Convenciones aplicadas (alineadas con el resto del módulo y con el
 * patrón establecido por `attendance_fault_hr_notification_logs`):
 *
 *   - Todas las columnas llevan prefijo del módulo
 *     (`employee_lactation_period_notification_` o
 *     `lactation_notification_`) para evitar choques.
 *   - FK a `employee_lactation_periods` con CASCADE: si la empresa
 *     decide hard-delete del periodo, su bitácora se va con él (no
 *     deja huérfanos).
 *   - Soft delete vía `employee_lactation_period_notification_deleted_at`
 *     para que RH pueda "limpiar" historial sin perder trazabilidad
 *     histórica vía consulta directa.
 *   - El nombre de la FK se acorta a `fk_elp_notif_period` para no
 *     superar el límite de 64 caracteres de MySQL (mismo patrón que
 *     `fk_elp_evid_period` en evidencias).
 */
export default class extends BaseSchema {
  protected tableName = 'employee_lactation_period_notifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_lactation_period_notification_id').notNullable()

      table.integer('employee_lactation_period_id').unsigned().notNullable()

      /**
       * Set cerrado de tipos de aviso. Hoy: 'expiring' (≤ 30 días para
       * vencer). El catálogo canónico vive en
       * `LACTATION_NOTIFICATION_TYPE_VALUES`. Mantenemos `varchar(20)`
       * para no migrar si más adelante se agregan otros tipos.
       */
      table.string('lactation_notification_type', 20).notNullable()

      /**
       * Momento real del envío. Lo guardamos explícito (además del
       * `_created_at`) porque el envío puede fallar / reintentarse y
       * preferimos un nombre semántico para esa fecha.
       */
      table.timestamp('lactation_notification_sent_at').notNullable()

      table.timestamp('employee_lactation_period_notification_created_at').notNullable()
      table.timestamp('employee_lactation_period_notification_updated_at').nullable()
      table.timestamp('employee_lactation_period_notification_deleted_at').nullable()

      table
        .foreign('employee_lactation_period_id', 'fk_elp_notif_period')
        .references('employee_lactation_period_id')
        .inTable('employee_lactation_periods')
        .onDelete('CASCADE')

      // Idempotencia: un mismo periodo no recibe el mismo tipo de aviso
      // dos veces. Si en el futuro se quiere "reenviar" hay que
      // hard-deletar la fila o usar otro `type`.
      table.unique(
        ['employee_lactation_period_id', 'lactation_notification_type'],
        'uq_elp_notif_period_type'
      )

      // Acelera el SELECT que excluye periodos ya notificados al correr
      // el comando agendado.
      table.index(['lactation_notification_type'], 'idx_elp_notif_type')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

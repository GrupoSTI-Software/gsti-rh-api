import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Estado de sincronizacion y procedencia del PIN en el pivote empleado por
 * dispositivo (spec v2, 8.1 y 10). Esta rebanada solo escribe `pin_source`
 * (`inferred` cuando el PIN se dedujo del codigo del colaborador) y deja
 * `sync_status` en su valor por omision; la maquina de estados completa llega
 * con la matriz.
 *
 * El indice por (dispositivo, PIN) lo usa la resolucion en CADA linea de cada
 * subida: sin el, cada checada seria un recorrido de tabla.
 */
export default class extends BaseSchema {
  protected tableName = 'access_point_employees'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('access_point_employee_sync_status', 20)
        .notNullable()
        .defaultTo('pending_pin')
        .after('access_point_employee_pin')
      table.timestamp('access_point_employee_sync_requested_at').nullable()
      table.timestamp('access_point_employee_sync_sent_at').nullable()
      table.timestamp('access_point_employee_sync_confirmed_at').nullable()
      table.timestamp('access_point_employee_sync_failed_at').nullable()
      table.string('access_point_employee_sync_failure_reason', 255).nullable()
      table
        .enum('access_point_employee_pin_source', ['legacy', 'assigned', 'inferred', 'device'])
        .notNullable()
        .defaultTo('legacy')
      table.integer('last_device_command_id').unsigned().nullable()

      table.index(
        ['access_point_id', 'access_point_employee_pin'],
        'idx_access_point_employee_pin'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(
        ['access_point_id', 'access_point_employee_pin'],
        'idx_access_point_employee_pin'
      )
      table.dropColumn('last_device_command_id')
      table.dropColumn('access_point_employee_pin_source')
      table.dropColumn('access_point_employee_sync_failure_reason')
      table.dropColumn('access_point_employee_sync_failed_at')
      table.dropColumn('access_point_employee_sync_confirmed_at')
      table.dropColumn('access_point_employee_sync_sent_at')
      table.dropColumn('access_point_employee_sync_requested_at')
      table.dropColumn('access_point_employee_sync_status')
    })
  }
}

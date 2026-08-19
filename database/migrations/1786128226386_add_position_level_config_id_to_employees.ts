import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Nivel del puesto asignado al empleado (USRH1785964117188).
 *
 * FK nullable hacia `position_position_levels` (INT UNSIGNED, misma clase que
 * su PK `increments`). `ON DELETE RESTRICT` espeja las tres FKs de la tabla
 * puente: la app nunca emite DELETE físico (SoftDeletes) y el guard
 * `hasAssignedEmployees` cierra la vía lógica con 409; RESTRICT cierra la
 * física para que un DELETE por SQL manual falle visible en vez de borrar en
 * silencio el dato del empleado.
 *
 * El índice compuesto `(position_level_config_id, employee_deleted_at)` sirve
 * a la vez a la FK (prefijo izquierdo) y a la consulta del guard. Se declara
 * ANTES del alterTable de la FK para que InnoDB lo reutilice y no cree uno
 * propio. Sin backfill: los empleados existentes quedan con NULL (regla 8).
 */
export default class extends BaseSchema {
  protected tableName = 'employees'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('position_level_config_id')
        .unsigned()
        .nullable()
        .defaultTo(null)
        .after('position_sync_id')
      table.index(
        ['position_level_config_id', 'employee_deleted_at'],
        'idx_employees_position_level_config'
      )
    })

    this.schema.alterTable(this.tableName, (table) => {
      table
        .foreign('position_level_config_id')
        .references('position_position_level_id')
        .inTable('position_position_levels')
        .onDelete('RESTRICT')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['position_level_config_id'])
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(
        ['position_level_config_id', 'employee_deleted_at'],
        'idx_employees_position_level_config'
      )
      table.dropColumn('position_level_config_id')
    })
  }
}

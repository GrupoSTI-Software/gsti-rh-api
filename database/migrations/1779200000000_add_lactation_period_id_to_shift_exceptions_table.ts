import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Conecta cada excepción de turno con el periodo de lactancia que la origina.
 *
 * - La columna es nullable: la mayoría de las excepciones del sistema no
 *   nacen de un periodo de lactancia.
 * - `ON DELETE CASCADE`: si por cualquier motivo se hace hard-delete del
 *   periodo a nivel DB, las excepciones generadas se eliminan también.
 *   El flujo normal de la aplicación usa soft-delete; este CASCADE es
 *   sólo una red de seguridad contra inconsistencia.
 * - Índice dedicado para acelerar las queries de regenerar/borrar masivo
 *   por `lactation_period_id` que ejecutará `ShiftExceptionService`.
 */
export default class extends BaseSchema {
  protected tableName = 'shift_exceptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('lactation_period_id')
        .unsigned()
        .nullable()
        .after('vacation_setting_id')
      table
        .foreign('lactation_period_id')
        .references('employee_lactation_period_id')
        .inTable('employee_lactation_periods')
        .onDelete('CASCADE')
      table.index(['lactation_period_id'], 'idx_shift_exceptions_lactation_period')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['lactation_period_id'], 'idx_shift_exceptions_lactation_period')
      table.dropForeign(['lactation_period_id'])
      table.dropColumn('lactation_period_id')
    })
  }
}

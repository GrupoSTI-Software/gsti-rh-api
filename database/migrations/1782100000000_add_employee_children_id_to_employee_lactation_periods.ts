import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Vincula opcionalmente un periodo de lactancia al hijo registrado de
 * la empleada que justifica el derecho. El dato puede no estar
 * capturado al momento del alta (sobre todo en empresas que cargan el
 * derecho antes de actualizar el expediente de hijos), por eso es
 * NULLABLE.
 *
 * - FK a `employee_children.employee_children_id` con `ON DELETE SET NULL`:
 *   si el hijo se elimina, el periodo se conserva con el vínculo en
 *   nulo (regla acordada de la HU para no perder histórico del derecho).
 *
 * - Índice para acelerar reportes que filtran por hijo (auditorías y
 *   reportes de compliance pueden cruzar lactancia ↔ hijos en el
 *   futuro). Costo despreciable en INSERT.
 *
 * - Reversible: el `down()` borra la columna sin tocar el resto del
 *   esquema. Como se borra la columna, MySQL elimina implícitamente la
 *   FK y el índice.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_lactation_periods'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('employee_children_id')
        .unsigned()
        .nullable()
        .references('employee_children_id')
        .inTable('employee_children')
        .onDelete('SET NULL')

      table.index(
        ['employee_children_id'],
        'idx_employee_lactation_periods_employee_children_id'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(
        ['employee_children_id'],
        'idx_employee_lactation_periods_employee_children_id'
      )
      table.dropForeign(['employee_children_id'])
      table.dropColumn('employee_children_id')
    })
  }
}

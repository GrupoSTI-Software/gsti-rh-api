import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * CAP-02-08-01 — Tipado de dimensiones de evaluación.
 *
 * Agrega la columna `assessment_template_dimension_data_type` a la tabla
 * `assessment_template_dimensions` como ENUM con tres valores admitidos:
 *   - 'numeric'         (numérico)
 *   - 'percent'         (porcentual)
 *   - 'categorical_amb' (categórico Alto/Medio/Bajo)
 *
 * El default 'numeric' garantiza un backfill seguro: todas las dimensiones
 * existentes quedan con `data_type='numeric'` sin romper datos previos.
 *
 * Migración reversible: el método `down()` elimina la columna.
 */
export default class extends BaseSchema {
  protected tableName = 'assessment_template_dimensions'
  protected columnName = 'assessment_template_dimension_data_type'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum(this.columnName, ['numeric', 'percent', 'categorical_amb'])
        .notNullable()
        .defaultTo('numeric')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn(this.columnName)
    })
  }
}

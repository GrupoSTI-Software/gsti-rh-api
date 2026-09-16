import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Aislamiento por empresa del historial de valor del activo. Cuelga del activo
 * (`supply_id`): en el alta el modelo resuelve la empresa desde ese activo, que
 * ya está acotado.
 *
 * La columna entra NULLABLE y la migración NO toca datos: las filas vivas se
 * asignan con `node ace backfill:zones-supplies-business-unit --apply`.
 *
 * El NOT NULL se impondrá en una migración posterior, cuando el backfill haya
 * corrido en todos los entornos.
 */
export default class extends BaseSchema {
  protected tableName = 'supply_value_histories'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('supply_value_history_id')
      table.index(['business_unit_id'], 'supply_value_histories_business_unit_id_index')
      table
        .foreign('business_unit_id', 'supply_value_histories_business_unit_id_foreign')
        .references('business_unit_id')
        .inTable('business_units')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'supply_value_histories_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'supply_value_histories_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Aislamiento por empresa de las características de activo. Cuelgan de
 * `supply_types`: en el alta el modelo resuelve la empresa desde su tipo padre.
 *
 * La columna entra NULLABLE y la migración NO toca datos: las filas vivas se
 * asignan con `node ace backfill:zones-supplies-business-unit --apply`.
 *
 * El NOT NULL se impondrá en una migración posterior, cuando el backfill haya
 * corrido en todos los entornos.
 */
export default class extends BaseSchema {
  protected tableName = 'supplie_caracteristics'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('supplie_caracteristic_id')
      table.index(['business_unit_id'], 'supplie_caracteristics_business_unit_id_index')
      table
        .foreign('business_unit_id', 'supplie_caracteristics_business_unit_id_foreign')
        .references('business_unit_id')
        .inTable('business_units')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'supplie_caracteristics_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'supplie_caracteristics_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}

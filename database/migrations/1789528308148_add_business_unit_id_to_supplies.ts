import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Aislamiento por empresa de los activos (`supplies`). Cuelgan de
 * `supply_types`: en el alta el modelo resuelve la empresa desde su tipo padre,
 * que ya está acotado, así que un `supplyTypeId` de otra empresa no resuelve.
 *
 * La columna entra NULLABLE y la migración NO toca datos: las filas vivas se
 * asignan con `node ace backfill:zones-supplies-business-unit --apply`.
 *
 * El NOT NULL se impondrá en una migración posterior, cuando el backfill haya
 * corrido en todos los entornos.
 */
export default class extends BaseSchema {
  protected tableName = 'supplies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('supply_id')
      table.index(['business_unit_id'], 'supplies_business_unit_id_index')
      table
        .foreign('business_unit_id', 'supplies_business_unit_id_foreign')
        .references('business_unit_id')
        .inTable('business_units')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'supplies_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'supplies_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}

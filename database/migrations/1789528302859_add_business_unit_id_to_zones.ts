import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Aislamiento por empresa de Zonas (alcance de lanzamiento SaaS).
 *
 * La columna entra NULLABLE y la migración NO toca datos: las filas vivas se
 * asignan con `node ace backfill:zones-supplies-business-unit --apply`, que
 * aborta si hay más de una empresa viva en vez de adivinar. Mientras una fila
 * siga en NULL, el mixin `withBusinessUnitScope` la deja fuera de toda consulta
 * con contexto de tenant: se pierde visibilidad, nunca aislamiento.
 *
 * El NOT NULL se impondrá en una migración posterior, cuando el backfill haya
 * corrido en todos los entornos.
 */
export default class extends BaseSchema {
  protected tableName = 'zones'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('zone_id')
      table.index(['business_unit_id'], 'zones_business_unit_id_index')
      table
        .foreign('business_unit_id', 'zones_business_unit_id_foreign')
        .references('business_unit_id')
        .inTable('business_units')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'zones_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'zones_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}

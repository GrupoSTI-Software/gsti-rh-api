import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * USRH1785441817226 — distingue empresas nacidas del registro self-service
 * de las dadas de alta por GSTI. Las filas existentes quedan `'platform'`
 * por el default; `'self_service'` lo escribe USRH1785441820858.
 */
export default class extends BaseSchema {
  protected tableName = 'business_units'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('business_unit_origin', ['self_service', 'platform'])
        .notNullable()
        .defaultTo('platform')
        .after('business_unit_active')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('business_unit_origin')
    })
  }
}

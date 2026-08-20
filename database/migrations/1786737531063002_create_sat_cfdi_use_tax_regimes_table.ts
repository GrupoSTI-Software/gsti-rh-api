import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pivote uso CFDI ↔ régimen fiscal receptor (USRH1786737531063).
 * Sin timestamps ni soft delete: se reconstruye con sync en el seeder.
 */
export default class extends BaseSchema {
  protected tableName = 'sat_cfdi_use_tax_regimes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('sat_cfdi_use_tax_regime_id').notNullable()

      table
        .integer('sat_cfdi_use_id')
        .unsigned()
        .notNullable()
        .references('sat_cfdi_use_id')
        .inTable('sat_cfdi_uses')
        .onDelete('RESTRICT')

      table
        .integer('sat_tax_regime_id')
        .unsigned()
        .notNullable()
        .references('sat_tax_regime_id')
        .inTable('sat_tax_regimes')
        .onDelete('RESTRICT')

      table.unique(
        ['sat_cfdi_use_id', 'sat_tax_regime_id'],
        'sat_cfdi_use_tax_regimes_use_regime_unique'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo SAT c_RegimenFiscal (USRH1786737531063).
 * Referencia global; sin business_unit_id ni scope por tenant.
 */
export default class extends BaseSchema {
  protected tableName = 'sat_tax_regimes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('sat_tax_regime_id').notNullable()

      table.string('sat_tax_regime_code', 4).notNullable().unique()
      table.string('sat_tax_regime_description', 255).notNullable()
      table.tinyint('sat_tax_regime_applies_to_individual').notNullable()
      table.tinyint('sat_tax_regime_applies_to_legal_entity').notNullable()
      table.tinyint('sat_tax_regime_active').notNullable().defaultTo(1)

      table.timestamp('sat_tax_regime_created_at').notNullable().defaultTo(this.now())
      table.timestamp('sat_tax_regime_updated_at').nullable()
      table.timestamp('sat_tax_regime_deleted_at').nullable().defaultTo(null)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo SAT c_UsoCFDI (USRH1786737531063).
 * Referencia global; sin business_unit_id ni scope por tenant.
 */
export default class extends BaseSchema {
  protected tableName = 'sat_cfdi_uses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('sat_cfdi_use_id').notNullable()

      table.string('sat_cfdi_use_code', 4).notNullable().unique()
      table.string('sat_cfdi_use_description', 255).notNullable()
      table.tinyint('sat_cfdi_use_applies_to_individual').notNullable()
      table.tinyint('sat_cfdi_use_applies_to_legal_entity').notNullable()
      table.tinyint('sat_cfdi_use_active').notNullable().defaultTo(1)

      table.timestamp('sat_cfdi_use_created_at').notNullable().defaultTo(this.now())
      table.timestamp('sat_cfdi_use_updated_at').nullable()
      table.timestamp('sat_cfdi_use_deleted_at').nullable().defaultTo(null)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

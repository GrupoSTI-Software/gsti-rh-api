import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marca de ubicación de la checada (VLRH-H1790812613756): `simulated`, `unverified`
 * o NULL. Nullable sin default: las filas existentes quedan NULL y no se recalcula
 * el histórico. Sin `.after(...)`: la columna al final permite el ALTER INSTANT de
 * MySQL 8.0.12+ sobre una tabla grande.
 */
export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('assist_location_flag', 20).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('assist_location_flag')
    })
  }
}

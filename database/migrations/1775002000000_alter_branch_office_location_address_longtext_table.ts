import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Amplía branch_office_location_address a LONGTEXT para GeoJSON (FeatureCollection, polígonos, etc.).
 * Idempotente si la tabla aún no existe (fallará al alter — ejecutar después de create branch_offices).
 */
export default class extends BaseSchema {
  protected tableName = 'branch_offices'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('branch_office_location_address', 'longtext').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('branch_office_location_address').nullable().alter()
    })
  }
}

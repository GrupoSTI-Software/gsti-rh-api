import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo de modelos de dispositivo biométrico autorizados por GSTI
 * (USRH1787189981870). Referencia global; sin business_unit_id ni scope
 * por tenant. Espeja el patrón de `sat_tax_regimes`.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_device_models'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('platform_device_model_id').notNullable()

      table.string('platform_device_model_brand', 100).notNullable()
      table.string('platform_device_model_name', 191).notNullable()
      table.string('platform_device_model_slug', 100).notNullable().unique()
      table
        .enum('platform_device_model_status', ['vigente', 'en_validacion', 'descontinuado'])
        .notNullable()
        .defaultTo('en_validacion')

      table.tinyint('platform_device_model_active').notNullable().defaultTo(1)

      table.timestamp('platform_device_model_created_at').notNullable().defaultTo(this.now())
      table.timestamp('platform_device_model_updated_at').nullable()
      table.timestamp('platform_device_model_deleted_at').nullable().defaultTo(null)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

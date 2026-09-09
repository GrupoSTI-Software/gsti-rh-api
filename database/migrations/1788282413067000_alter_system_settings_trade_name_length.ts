import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `system_setting_trade_name` pasa de varchar(150) a varchar(200) para admitir
 * sin truncar el nombre de la empresa (`business_units.business_unit_name` es
 * varchar(200)), que ahora se siembra como nombre comercial al provisionar la
 * configuración de un tenant nuevo.
 *
 * Sin `await` sobre `this.schema`: Lucid ejecuta los builders de forma diferida
 * al terminar `up()`; el await manual provoca doble ejecución del SQL.
 */
export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('system_setting_trade_name', 200).notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('system_setting_trade_name', 150).notNullable().alter()
    })
  }
}

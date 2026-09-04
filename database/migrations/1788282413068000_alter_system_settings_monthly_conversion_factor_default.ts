import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * El `DEFAULT` de `system_setting_monthly_conversion_factor` pasa de 30.40 a
 * 30.42, alineado con `SYSTEM_SETTING_MONTHLY_CONVERSION_FACTOR_DEFAULT`
 * (`app/constants/system_setting_defaults.ts`), que gobierna tanto el alta
 * automática de tenants como el alta manual desde el BO.
 *
 * Solo cambia el default de la columna: las filas existentes conservan su valor
 * (el cambio no es retroactivo, por decisión de producto).
 *
 * Sin `await` sobre `this.schema`: Lucid ejecuta los builders de forma diferida
 * al terminar `up()`; el await manual provoca doble ejecución del SQL.
 */
export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('system_setting_monthly_conversion_factor', 5, 2).notNullable().defaultTo(30.42).alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('system_setting_monthly_conversion_factor', 5, 2).notNullable().defaultTo(30.4).alter()
    })
  }
}

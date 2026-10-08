import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * VLRH-H1790812613753: margen de tolerancia de la zona de asistencia, en metros
 * enteros, por empresa. Las filas existentes toman 50 por el `DEFAULT`.
 *
 * El literal 50 repite `SYSTEM_SETTING_ZONE_TOLERANCE_METERS_DEFAULT`
 * (`app/constants/system_setting_defaults.ts`): una migración no importa
 * constantes de la app.
 */
export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('system_setting_zone_tolerance_meters')
        .unsigned()
        .notNullable()
        .defaultTo(50)
        .after('system_setting_monthly_conversion_factor')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('system_setting_zone_tolerance_meters')
    })
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Amarre entre el equipo registrado del cliente (`access_points`) y la
 * unidad física del inventario de plataforma (`platform_devices`),
 * USRH1787193625428.
 *
 * Nace NULL en todas las filas: los `access_points` preexistentes y los que
 * el cliente da de alta a mano no vienen de ninguna entrega nuestra. Esta
 * HU solo crea la columna; quien la llena es "Precargar el punto de acceso
 * del tenant al asignar la unidad" (USRH1787189981879).
 *
 * `platform_devices.platform_device_id` es `table.increments()` = INT
 * UNSIGNED; la FK debe declararse `integer().unsigned()` — un `bigInteger`
 * rompe la creación de la FK en MySQL.
 */
export default class extends BaseSchema {
  protected tableName = 'access_points'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('platform_device_id')
        .unsigned()
        .nullable()
        .after('business_unit_id')
      table
        .foreign('platform_device_id', 'fk_ap_platform_device')
        .references('platform_device_id')
        .inTable('platform_devices')
        .onDelete('RESTRICT')
      table.index(['platform_device_id'], 'idx_access_point_platform_device')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('platform_device_id', 'fk_ap_platform_device')
      table.dropIndex(['platform_device_id'], 'idx_access_point_platform_device')
      table.dropColumn('platform_device_id')
    })
  }
}

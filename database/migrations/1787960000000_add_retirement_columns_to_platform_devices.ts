import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agrega las columnas de ciclo de vida de retiro al inventario de aparatos.
 * La dueña de estas columnas es la HU USRH1787189981877 (C-4 del set).
 *
 * `platform_device_retire_reason` — motivo del retiro (enum de 5 valores;
 *   los 4 visibles al operador son danado/obsoleto/vendido/extraviado;
 *   del_cliente es reservado para retiro automático al desasignar un
 *   aparato de origen del_cliente en una HU posterior).
 *
 * `platform_device_retired_at` — fecha en que se ejecutó el retiro.
 *   NULL = la unidad no está retirada; NOT NULL = está fuera de circulación.
 *
 * El UNIQUE de `platform_device_serial_number` creado por la HU 1873
 * es de columna única (sin `deleted_at`): un aparato retirado conserva
 * ocupado su número de serie por diseño de BD, sin código adicional.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_devices'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('platform_device_retire_reason', [
          'danado',
          'obsoleto',
          'vendido',
          'extraviado',
          'del_cliente',
        ])
        .nullable()
        .after('platform_device_stock_status')

      table
        .date('platform_device_retired_at')
        .nullable()
        .after('platform_device_retire_reason')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('platform_device_retire_reason')
      table.dropColumn('platform_device_retired_at')
    })
  }
}

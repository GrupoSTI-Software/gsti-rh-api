import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agrega el motivo de liberación a la asignación (USRH1787189981881 · §10 del spec).
 *
 * Propiedad de columnas resuelta por el set (C-4): esta migración crea
 * **únicamente** `platform_device_assignment_release_reason`. La columna
 * hermana `platform_devices.platform_device_retire_reason` la crea
 * "Desactivar y retirar unidades del inventario" (USRH1787189981877,
 * migración `1787960000000_add_retirement_columns_to_platform_devices.ts`)
 * — ya integrada, con el enum `['danado','obsoleto','vendido','extraviado',
 * 'del_cliente']`, que ya incluye los dos valores que esta HU escribe
 * (`vendido`, `del_cliente`). Esta HU solo los escribe, no los declara.
 *
 * Nullable a propósito (R1 del spec): una asignación vigente no tiene
 * motivo de liberación; se puebla únicamente al cerrarla.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_device_assignments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('platform_device_assignment_release_reason', [
          'devolucion_comodato',
          'cambio_equipo',
          'baja_cliente',
        ])
        .nullable()
        .after('platform_device_assignment_released_at')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('platform_device_assignment_release_reason')
    })
  }
}

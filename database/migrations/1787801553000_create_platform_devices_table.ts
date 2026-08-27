import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Inventario general de aparatos biométricos físicos de GSTI
 * (USRH1787189981873 · §10 del spec).
 *
 * Tabla global sin `business_unit_id`: el aparato es dato de GSTI, no de tenant.
 * La asignación a un tenant vive en una tabla separada (entrega 1876).
 *
 * Decisiones de unicidad (§13 y §10 del spec):
 * - El UNIQUE sobre `platform_device_serial_number` NO incluye `deleted_at`,
 *   porque en MySQL los NULL en columnas de un índice único se tratan como
 *   distintos entre sí, lo que permitiría duplicar series entre filas con baja.
 *   Consecuencia: una serie de una unidad dada de baja lógicamente queda
 *   ocupada para siempre. Eso es intencional: si hace falta liberarla se hace
 *   por corrección de datos, no desde el panel.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_devices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('platform_device_id').notNullable()

      table
        .integer('platform_device_model_id')
        .unsigned()
        .notNullable()
        .references('platform_device_model_id')
        .inTable('platform_device_models')
        .onDelete('RESTRICT')

      // R2: único en toda la plataforma, longitud alineada con
      // access_points.access_point_serial_number (1769633415047:13)
      table.string('platform_device_serial_number', 100).notNullable()

      // R4: sin default, el operador declara explícitamente el origen
      table
        .enum('platform_device_origin', ['propia', 'del_cliente'])
        .notNullable()

      // R7, R11: nace disponible; asignada/retirada las producen otras rebanadas
      table
        .enum('platform_device_stock_status', ['disponible', 'asignada', 'retirada'])
        .notNullable()
        .defaultTo('disponible')

      // R5, R6: solo para aparatos propios, entero de centavos (C-2 del set)
      table.integer('platform_device_acquisition_cost_cents').unsigned().nullable()
      table.date('platform_device_acquisition_date').nullable()

      // R12: vigencia y baja lógica
      table.tinyint('platform_device_active').notNullable().defaultTo(1)

      table.timestamp('platform_device_created_at').notNullable().defaultTo(this.now())
      table.timestamp('platform_device_updated_at').nullable()
      table.timestamp('platform_device_deleted_at').nullable().defaultTo(null)

      // Unicidad de serie (R2): sin incluir deleted_at, ver nota de la clase
      table.unique(['platform_device_serial_number'], { indexName: 'uq_platform_device_serial' })

      // Para el tablero de inventario que filtrará por stock_status (entrega 1874)
      table.index(['platform_device_stock_status'], 'idx_platform_device_stock_status')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Registro de colocaciones — entregas de un aparato del inventario a una
 * empresa cliente (USRH1787189981876 · §10 del spec).
 *
 * Invariante duro: una sola fila con `released_at IS NULL` por aparato.
 * Este invariante lo sostiene el candado transaccional del servicio
 * (forUpdate sobre `platform_devices`), NO un índice de BD — MySQL no soporta
 * índices parciales y un UNIQUE(device_id, released_at) sería inútil porque
 * los NULL no colisionan entre sí en MySQL (mismo razonamiento documentado en
 * 1783000000001_create_work_journal_entries_table.ts:72-77).
 *
 * Sin columnas de dinero (C-2): el precio de venta y el régimen de tenencia
 * los agrega "Registrar el régimen de tenencia y el precio de venta de la
 * asignación". Sin `release_reason`: lo agrega "Desasignar la unidad".
 *
 * Sin mixin de scope de tenant (§10): el modelo lleva `business_unit_id` como
 * dato de negocio pero NO compone `withBusinessUnitScope`. Es dato de plataforma.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_device_assignments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('platform_device_assignment_id').notNullable()

      table
        .integer('platform_device_id')
        .unsigned()
        .notNullable()
        .references('platform_device_id')
        .inTable('platform_devices')
        .onDelete('RESTRICT')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        // Sin cascada: el histórico de entregas sobrevive al tenant
        .onDelete('RESTRICT')

      // RN6: fecha de entrega obligatoria, no futura
      table.date('platform_device_assignment_delivered_at').notNullable()

      // NULL = la entrega sigue abierta (aparato todavía en el cliente)
      table.date('platform_device_assignment_released_at').nullable()

      // Trazabilidad de quién registró la entrega
      table
        .integer('platform_device_assignment_created_by_user_id')
        .unsigned()
        .nullable()
        .references('user_id')
        .inTable('users')
        .onDelete('SET NULL')

      table
        .timestamp('platform_device_assignment_created_at')
        .notNullable()
        .defaultTo(this.now())
      table.timestamp('platform_device_assignment_updated_at').nullable()
      table.timestamp('platform_device_assignment_deleted_at').nullable().defaultTo(null)

      // Para filtrar entregas abiertas de un aparato
      table.index(['platform_device_id'], 'idx_pda_device')

      // Para el listado de entregas abiertas de un tenant
      table.index(
        ['business_unit_id', 'platform_device_assignment_released_at'],
        'idx_pda_bu_open'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

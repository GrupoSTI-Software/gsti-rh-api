import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agrega el régimen de tenencia y el precio de venta a la asignación
 * (USRH1787189981880 · §10.1 del spec).
 *
 * Registro interno de control: NO toca `billing_*`, no genera cobro ni
 * timbra CFDI. La coherencia régimen↔precio↔origen se garantiza en
 * `PlatformDeviceAssignmentService`, no con un `CHECK` de BD (el repo no usa
 * ninguno en sus migraciones — decisión, no omisión).
 *
 * `platform_device_assignment_tenure_regime` es NOT NULL sin `defaultTo`
 * a propósito: es una decisión de negocio explícita en cada entrega, un
 * default la volvería silenciosa. La tabla nace vacía de este campo en
 * cualquier entorno donde ya corrieron 1876/1879, así que el ALTER no choca
 * con filas existentes.
 *
 * Precio en centavos, `INT UNSIGNED` — estándar vigente del módulo de dinero
 * (`1784300000014_create_billing_payments_table.ts:5-9`), NO el legado
 * `decimal(12,2)`. Moneda como columna explícita (`CHAR(3)`, molde
 * `1783550000002_create_billing_plan_prices_table.ts:17`).
 */
export default class extends BaseSchema {
  protected tableName = 'platform_device_assignments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('platform_device_assignment_tenure_regime', ['comodato', 'venta', 'propiedad_cliente'])
        .notNullable()
        .after('platform_device_assignment_released_at')

      table
        .integer('platform_device_assignment_sale_price_cents')
        .unsigned()
        .nullable()
        .after('platform_device_assignment_tenure_regime')

      // Solo significativa cuando hay precio (tenureRegime = 'venta').
      table
        .specificType('platform_device_assignment_sale_currency', 'CHAR(3)')
        .notNullable()
        .defaultTo('MXN')
        .after('platform_device_assignment_sale_price_cents')

      table.index(
        ['platform_device_assignment_tenure_regime'],
        'idx_pda_tenure_regime'
      )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['platform_device_assignment_tenure_regime'], 'idx_pda_tenure_regime')
      table.dropColumn('platform_device_assignment_sale_currency')
      table.dropColumn('platform_device_assignment_sale_price_cents')
      table.dropColumn('platform_device_assignment_tenure_regime')
    })
  }
}

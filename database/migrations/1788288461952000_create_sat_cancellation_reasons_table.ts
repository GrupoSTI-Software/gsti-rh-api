import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo `c_MotivoCancelacion` del SAT (USRH1788288461952).
 *
 * Referencia global: sin `business_unit_id` y sin scope de tenant, igual que
 * `sat_tax_regimes` y `sat_cfdi_uses`. `sat_cancellation_reason_requires_substitute`
 * es el dato que decide si un motivo obliga a declarar folio sustituto; la regla
 * sale del catálogo, nunca de un literal `'01'` en el código.
 */
export default class extends BaseSchema {
  protected tableName = 'sat_cancellation_reasons'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('sat_cancellation_reason_id').notNullable()

      // UNIQUE obligatorio: billing_tax_receipts referencia esta columna, no la PK.
      table.string('sat_cancellation_reason_code', 2).notNullable().unique()

      table.string('sat_cancellation_reason_description', 255).notNullable()
      table.tinyint('sat_cancellation_reason_requires_substitute').notNullable().defaultTo(0)
      table.tinyint('sat_cancellation_reason_active').notNullable().defaultTo(1)

      table.timestamp('sat_cancellation_reason_created_at').notNullable().defaultTo(this.now())
      table.timestamp('sat_cancellation_reason_updated_at').nullable()
      table.timestamp('sat_cancellation_reason_deleted_at').nullable().defaultTo(null)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

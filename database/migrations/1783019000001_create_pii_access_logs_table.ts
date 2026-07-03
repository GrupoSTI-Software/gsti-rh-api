import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tabla de auditoría inmutable de accesos a datos personales sensibles.
 *
 * Convención de nomenclatura:
 *   - Columnas propias          → prefijo `pii_access_log_` (p.ej. `pii_access_log_model`).
 *   - Columnas FK               → nombre exacto de la PK referenciada, sin prefijo
 *                                 (p.ej. `business_unit_id`, `user_id`).
 *
 * Fundamentación legal:
 *   - LFPDPPP art. 19 — medidas de seguridad administrativas, físicas y técnicas.
 *   - Reglamento LFPDPPP art. 60 y 61 — registro de tratamientos sobre datos sensibles.
 *
 * Invariantes de diseño:
 *   1. Inmutabilidad — no existen columnas `updated_at` ni `deleted_at`.
 *      La aplicación nunca debe emitir UPDATE o DELETE sobre esta tabla.
 *   2. Multi-tenancy — `business_unit_id` es obligatorio en toda fila.
 *   3. La única puerta de escritura es `PiiAccessLogService.record`.
 *
 * Ref: USRH1783019898097 — Enmascarar datos sensibles y registrar acceso al dato completo.
 */
export default class extends BaseSchema {
  protected tableName = 'pii_access_logs'

  protected wrapInTransaction = false

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('pii_access_log_id').primary()

      // ─── Tenancy ───────────────────────────────────────────────────────────
      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')

      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')

      table.string('pii_access_log_model', 100).notNullable()
      table.string('pii_access_log_model_column', 100).notNullable()
      table.bigInteger('pii_access_log_record_id').unsigned().notNullable()
      table.string('pii_access_log_accessor_ip', 45).notNullable()
      table.text('pii_access_log_accessor_user_agent').nullable()
      table.string('pii_access_log_request_id', 36).nullable()
      table.timestamp('pii_access_log_created_at').notNullable()
      table.timestamp('pii_access_log_updated_at').nullable()
      table.timestamp('pii_access_log_deleted_at').nullable()

      // ─── Índices de consulta de auditoría ──────────────────────────────────
      table.index(['business_unit_id', 'user_id'], 'pii_access_logs_bu_user_idx')
      table.index(
        ['business_unit_id', 'pii_access_log_model', 'pii_access_log_record_id'],
        'pii_access_logs_bu_model_record_idx'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

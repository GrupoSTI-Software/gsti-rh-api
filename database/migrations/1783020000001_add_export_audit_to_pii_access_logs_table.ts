import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Extiende `pii_access_logs` con columnas de asiento agrupado para exportaciones masivas.
 *
 * `pii_access_log_model`, `pii_access_log_model_column` y `pii_access_log_record_id`
 * pasan a nullable: los asientos de export no usan revelado individual.
 *
 * Ref: USRH1783029947540 — Registrar acceso a datos sensibles en exportaciones masivas.
 */
export default class extends BaseSchema {
  protected tableName = 'pii_access_logs'

  protected wrapInTransaction = false

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('pii_access_log_model', 100).nullable().alter()
      table.string('pii_access_log_model_column', 100).nullable().alter()
      table.bigInteger('pii_access_log_record_id').unsigned().nullable().alter()

      table.string('pii_access_log_export_key', 100).nullable()
      table.json('pii_access_log_columns').nullable()
      table.integer('pii_access_log_subject_count').unsigned().nullable()
      table.json('pii_access_log_filters').nullable()
      table.string('pii_access_log_motive', 50).nullable()
      table.string('pii_access_log_note', 255).nullable()
      table.string('pii_access_log_origin_module', 100).nullable()

      table.index(['pii_access_log_export_key'], 'pii_access_logs_export_key_idx')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['pii_access_log_export_key'], 'pii_access_logs_export_key_idx')

      table.dropColumn('pii_access_log_origin_module')
      table.dropColumn('pii_access_log_note')
      table.dropColumn('pii_access_log_motive')
      table.dropColumn('pii_access_log_filters')
      table.dropColumn('pii_access_log_subject_count')
      table.dropColumn('pii_access_log_columns')
      table.dropColumn('pii_access_log_export_key')

      table.string('pii_access_log_model', 100).notNullable().alter()
      table.string('pii_access_log_model_column', 100).notNullable().alter()
      table.bigInteger('pii_access_log_record_id').unsigned().notNullable().alter()
    })
  }
}

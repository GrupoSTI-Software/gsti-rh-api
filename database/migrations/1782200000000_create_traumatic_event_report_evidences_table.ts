import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Evidencias documentales adjuntas a un reporte de evento traumático
 * (NOM-035 §6.5: el trabajador informa por escrito al patrón).
 *
 * Convenciones del repo aplicadas:
 *  - Todas las columnas llevan el prefijo `traumatic_event_report_evidence_`.
 *  - `traumatic_event_report_id` es la única FK; CASCADE en hard-delete del
 *    reporte (el flujo usa soft-delete pero esto cubre red de seguridad).
 *  - El archivo se guarda como Key de S3 (UploadService 'private'); nunca
 *    se expone al cliente, solo URLs firmadas temporales.
 *  - Soft delete via columna `_deleted_at`.
 *  - Índice compuesto (reportId, deletedAt) para listar por reporte activo.
 */
export default class extends BaseSchema {
  protected tableName = 'traumatic_event_report_evidences'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('traumatic_event_report_evidence_id').notNullable()

      /**
       * FK declarada sin .references() inline para usar nombre corto (<64 chars).
       * El nombre auto-generado por Knex superaría el límite de MySQL.
       */
      table.integer('traumatic_event_report_id').unsigned().notNullable()

      table.string('traumatic_event_report_evidence_file', 2048).notNullable()
      table.string('traumatic_event_report_evidence_original_name', 255).nullable()

      /**
       * Categorías del documento:
       *  - written_statement: escrito del trabajador (NOM-035 §6.5).
       *  - incident_record: acta o constancia del evento.
       *  - other: cualquier otra evidencia relevante.
       */
      table
        .string('traumatic_event_report_evidence_category', 30)
        .notNullable()
        .defaultTo('other')

      table.timestamp('traumatic_event_report_evidence_created_at').notNullable()
      table.timestamp('traumatic_event_report_evidence_updated_at').nullable()
      table.timestamp('traumatic_event_report_evidence_deleted_at').nullable()

      table
        .foreign('traumatic_event_report_id', 'fk_ter_evid_report')
        .references('traumatic_event_report_id')
        .inTable('traumatic_event_reports')
        .onDelete('CASCADE')

      table.index(
        ['traumatic_event_report_id', 'traumatic_event_report_evidence_deleted_at'],
        'idx_ter_evid_report_active'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Catálogo de evidencias documentales adjuntas a un periodo de lactancia
 * (PDFs requeridos para cumplir con LFT artículo 170 fracción II e
 * inspecciones STPS).
 *
 * Convenciones del repo aplicadas:
 *  - Todas las columnas llevan el prefijo `employee_lactation_period_evidence_`.
 *  - `employee_lactation_period_id` es la única FK; CASCADE en hard-delete del
 *    periodo (el flujo de la aplicación usa soft-delete pero esto cubre red
 *    de seguridad contra inconsistencia).
 *  - El archivo se guarda como `Key` de S3 (UploadService con permission
 *    'private'); jamás se expone al cliente, sólo URLs firmadas.
 *  - Soft delete via columna `_deleted_at`.
 *  - Índice compuesto (periodId, deletedAt) para acelerar listado por periodo
 *    excluyendo borrados.
 */
export default class extends BaseSchema {
  protected tableName = 'employee_lactation_period_evidences'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_lactation_period_evidence_id').notNullable()

      /**
       * Declaramos la columna sin `.references(...)` y construimos la foreign
       * key con `table.foreign(..., 'fk_elp_evid_period')` porque el nombre
       * auto-generado por Knex
       * (`employee_lactation_period_evidences_employee_lactation_period_id_foreign`)
       * supera el límite de 64 caracteres de MySQL.
       */
      table.integer('employee_lactation_period_id').unsigned().notNullable()

      table.string('employee_lactation_period_evidence_file', 2048).notNullable()
      table.string('employee_lactation_period_evidence_original_name', 255).nullable()

      /**
       * Categoría del documento. Set cerrado:
       *  - agreement: acuerdo escrito patrón-empleada (LFT 170 II).
       *  - birth_support: comprobante del nacimiento que justifica el periodo.
       *  - other: cualquier otra evidencia relevante (ej. constancias médicas).
       */
      table
        .string('employee_lactation_period_evidence_category', 30)
        .notNullable()
        .defaultTo('other')

      table.timestamp('employee_lactation_period_evidence_created_at').notNullable()
      table.timestamp('employee_lactation_period_evidence_updated_at').nullable()
      table.timestamp('employee_lactation_period_evidence_deleted_at').nullable()

      table
        .foreign('employee_lactation_period_id', 'fk_elp_evid_period')
        .references('employee_lactation_period_id')
        .inTable('employee_lactation_periods')
        .onDelete('CASCADE')

      table.index(
        ['employee_lactation_period_id', 'employee_lactation_period_evidence_deleted_at'],
        'idx_elp_evid_period_active'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

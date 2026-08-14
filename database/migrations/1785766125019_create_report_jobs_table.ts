import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tabla de trabajos de generación de reportes en segundo plano.
 *
 * Diseñada para reutilizarse en todas las historias de la cadena
 * USRH1785766125019–USRH1785766125028:
 *   - `'assistance_all'`  → reporte de todas las asistencias (esta historia)
 *   - Tipos futuros se agregan sin migración de esquema (columna `report_job_type`).
 *
 * Invariantes de diseño:
 *   1. El campo `allowed_business_unit_ids` captura el scope del usuario al momento
 *      de solicitar el reporte, evitando filtraciones si el scope cambia mientras
 *      el job corre en segundo plano.
 *   2. Un job fallido nunca queda marcado como completado (regla de negocio #10).
 *   3. `expires_at` + el comando `report-jobs:cleanup` garantizan que los archivos
 *      temporales de S3 se borren automáticamente (TTL de 24 h por defecto).
 *
 * Ref: USRH1785766125019 — Generar en el servidor el reporte de todas las asistencias.
 */
export default class extends BaseSchema {
  protected tableName = 'report_jobs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('report_job_id', 36).primary()

      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('user_id')
        .inTable('users')
        .onDelete('CASCADE')

      table
        .string('report_job_type', 50)
        .notNullable()
        .comment('assistance_all | …')

      table.json('report_job_filters').notNullable()
      table.json('report_job_allowed_business_unit_ids').notNullable()

      table
        .enum('report_job_status', ['pending', 'processing', 'completed', 'failed'])
        .notNullable()
        .defaultTo('pending')

      table.integer('report_job_progress_current').unsigned().notNullable().defaultTo(0)
      table.integer('report_job_progress_total').unsigned().notNullable().defaultTo(0)

      table.string('report_job_file_key', 500).nullable()
      table.string('report_job_file_name', 255).nullable()
      table.text('report_job_error_message').nullable()

      table.timestamp('report_job_completed_at').nullable()
      table.timestamp('report_job_expires_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['user_id', 'report_job_status'], 'report_jobs_user_status_idx')
      table.index(['report_job_status', 'report_job_expires_at'], 'report_jobs_status_expires_idx')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

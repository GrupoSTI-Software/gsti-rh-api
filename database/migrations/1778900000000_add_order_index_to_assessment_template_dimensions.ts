import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * CAP-02-08-XX — Reordenar dimensiones de plantilla de evaluación.
 *
 * 1. Agrega la columna `assessment_template_dimension_order_index`
 *    (SMALLINT NOT NULL DEFAULT 0).
 * 2. Backfill: por cada plantilla activa, asigna `order_index = 0..N-1`
 *    siguiendo el orden histórico (id ASC). De esta forma las dimensiones
 *    existentes preservan exactamente el orden en que se mostraban antes
 *    de esta HU y los resultados históricos quedan referenciados por
 *    `assessment_template_dimension_id` (no por la columna nueva).
 *
 * Migración reversible: el `down()` elimina la columna.
 */
export default class extends BaseSchema {
  protected tableName = 'assessment_template_dimensions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .smallint('assessment_template_dimension_order_index')
        .notNullable()
        .defaultTo(0)
    })

    // Backfill por plantilla — `defer` permite ejecutar SQL imperativo
    // tras finalizar el alter de schema en motores que lo requieren.
    this.defer(async (db) => {
      const templateIds: { assessment_template_id: number }[] = await db
        .from(this.tableName)
        .whereNull('assessment_template_dimension_deleted_at')
        .distinct('assessment_template_id')
      for (const row of templateIds) {
        const templateId = row.assessment_template_id
        const dims: { assessment_template_dimension_id: number }[] = await db
          .from(this.tableName)
          .whereNull('assessment_template_dimension_deleted_at')
          .where('assessment_template_id', templateId)
          .orderBy('assessment_template_dimension_id', 'asc')
          .select('assessment_template_dimension_id')
        let index = 0
        for (const dim of dims) {
          await db
            .from(this.tableName)
            .where(
              'assessment_template_dimension_id',
              dim.assessment_template_dimension_id
            )
            .update({ assessment_template_dimension_order_index: index })
          index += 1
        }
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('assessment_template_dimension_order_index')
    })
  }
}

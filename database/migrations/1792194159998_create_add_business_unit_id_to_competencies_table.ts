import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * VLRH-H1792026427127 — raíz del catálogo de competencias por empresa.
 * NULLABLE sin backfill: NULL = competencia de plantilla (VLRH-C0192 R1),
 * nunca visible para un cliente. Base limpia: no hay filas que convertir.
 */
export default class extends BaseSchema {
  protected tableName = 'competencies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('competency_id')
      table.index(['business_unit_id'], 'competencies_business_unit_id_index')
      table
        .foreign('business_unit_id', 'competencies_business_unit_id_foreign')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'competencies_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'competencies_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}

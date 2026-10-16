import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * VLRH-H1792026427127 — rangos heredan la pertenencia de su descriptor padre
 * (`resolveParentBusinessUnitId`). NULLABLE sin backfill: un rango de una
 * competencia de plantilla también es NULL.
 */
export default class extends BaseSchema {
  protected tableName = 'competency_brackets'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_id').unsigned().nullable().after('competency_descriptor_id')
      table.index(['business_unit_id'], 'competency_brackets_business_unit_id_index')
      table
        .foreign('business_unit_id', 'competency_brackets_business_unit_id_foreign')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_unit_id'], 'competency_brackets_business_unit_id_foreign')
      table.dropIndex(['business_unit_id'], 'competency_brackets_business_unit_id_index')
      table.dropColumn('business_unit_id')
    })
  }
}

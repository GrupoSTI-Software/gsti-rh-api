import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Minutos de HE triple extendidos (autorizadas + no autorizadas) por semana ISO.
 * Solo se llenan cuando `PAYROLL_OVERTIME_INCLUDE_UNAUTHORIZED=true`.
 */
export default class extends BaseSchema {
  protected tableName = 'overtime_weekly_details'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('overtime_weekly_detail_extended_triple_minutes')
        .unsigned()
        .notNullable()
        .defaultTo(0)
        .after('overtime_weekly_detail_extended_double_minutes')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('overtime_weekly_detail_extended_triple_minutes')
    })
  }
}

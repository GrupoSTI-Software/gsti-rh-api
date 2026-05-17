import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_competency_evaluations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('employee_competency_evaluation_bracket_range_max', 4, 2).nullable().after('employee_competency_evaluation_bracket_range_min')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_competency_evaluation_bracket_range_max')
    })
  }
}
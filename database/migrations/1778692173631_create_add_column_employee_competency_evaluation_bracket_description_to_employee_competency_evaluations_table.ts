import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_competency_evaluations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('employee_competency_evaluation_bracket_description').nullable().after('competency_bracket_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_competency_evaluation_bracket_description')
    })
  }
}
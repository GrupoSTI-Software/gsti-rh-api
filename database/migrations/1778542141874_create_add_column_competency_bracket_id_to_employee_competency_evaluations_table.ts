import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_competency_evaluations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('competency_bracket_id')
      .unsigned()
      .references('competency_brackets.competency_bracket_id')
      .after('business_unit_competency_level_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('competency_bracket_id')
    })
  }
}
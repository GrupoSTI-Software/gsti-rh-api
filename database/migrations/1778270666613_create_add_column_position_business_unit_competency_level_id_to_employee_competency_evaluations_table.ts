import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_competency_evaluations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('position_business_unit_competency_level_id').unsigned().nullable().after('employee_evaluation_id')
      table.foreign('position_business_unit_competency_level_id', 'fk_ece_pbucl1').references('position_business_unit_competency_level_id').inTable('position_business_unit_competency_levels')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('position_business_unit_competency_level_id', 'fk_ece_pbucl1')
      table.dropColumn('position_business_unit_competency_level_id')
    })
  }
}
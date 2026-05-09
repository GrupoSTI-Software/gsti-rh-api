import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_competency_evaluations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_unit_competency_level_id').unsigned().nullable().after('position_business_unit_competency_level_id')
      table.foreign('business_unit_competency_level_id', 'fk_ece_bucl1').references('business_unit_competency_level_id').inTable('business_unit_competency_levels')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('business_unit_competency_level_id', 'fk_ece_bucl1')
      table.dropColumn('business_unit_competency_level_id')
    })
  }
}
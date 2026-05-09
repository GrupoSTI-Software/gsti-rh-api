import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_competency_evaluations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('position_competency_id')
      table.dropColumn('position_competency_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('position_competency_id').unsigned()
      table.foreign('position_competency_id').references('position_competency_id').inTable('position_competencies')
    })
  }
}
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_competency_evaluations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign('weight_id')
      table.dropColumn('weight_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('weight_id').unsigned()
      table.foreign('weight_id').references('weight_id').inTable('weights')
    })
  }
}
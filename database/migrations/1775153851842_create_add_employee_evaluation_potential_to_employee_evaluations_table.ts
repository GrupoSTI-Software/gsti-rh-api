import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_evaluations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('employee_evaluation_potential')
        .after('employee_evaluation_score')
        .notNullable()
        .defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_evaluation_potential')
    })
  }
}


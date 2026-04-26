import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_competency_evaluations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_competency_evaluation_id')

      table.integer('employee_evaluation_id').unsigned().references('employee_evaluations.employee_evaluation_id')
      table.integer('position_competency_id').unsigned().references('position_competencies.position_competency_id')
      table.integer('weight_id').unsigned().references('weights.weight_id')

      table.timestamp('employee_competency_evaluation_created_at').notNullable()
      table.timestamp('employee_competency_evaluation_updated_at').nullable()
      table.timestamp('employee_competency_evaluation_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
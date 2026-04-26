import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_psychometric_evaluation_results'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_psychometric_evaluation_result_id').notNullable()
      table.integer('employee_psychometric_evaluation_id').unsigned().notNullable()
      table.integer('psychometric_test_dimension_id').unsigned().notNullable()

      table
        .foreign('employee_psychometric_evaluation_id', 'emp_psych_eval_result_eval_fk')
        .references('employee_psychometric_evaluation_id')
        .inTable('employee_psychometric_evaluations')
        .onDelete('CASCADE')
      table
        .foreign('psychometric_test_dimension_id', 'emp_psych_eval_result_dim_fk')
        .references('psychometric_test_dimension_id')
        .inTable('psychometric_test_dimensions')
        .onDelete('CASCADE')

      table.string('employee_psychometric_evaluation_result_value', 255).nullable()
      table.string('employee_psychometric_evaluation_result_status', 20).nullable()

      table.timestamp('employee_psychometric_evaluation_result_created_at').notNullable()
      table.timestamp('employee_psychometric_evaluation_result_updated_at').nullable()
      table.timestamp('employee_psychometric_evaluation_result_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

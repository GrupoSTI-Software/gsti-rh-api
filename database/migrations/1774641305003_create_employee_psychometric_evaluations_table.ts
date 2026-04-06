import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_psychometric_evaluations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_psychometric_evaluation_id').notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.integer('psychometric_test_id').unsigned().notNullable()

      table
        .foreign('employee_id', 'emp_psych_eval_employee_fk')
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')
      table
        .foreign('psychometric_test_id', 'emp_psych_eval_test_fk')
        .references('psychometric_test_id')
        .inTable('psychometric_tests')
        .onDelete('CASCADE')

      table.date('employee_psychometric_evaluation_date').notNullable()
      table
        .string('employee_psychometric_evaluation_status', 20)
        .notNullable()
        .defaultTo('pending')

      table
        .unique(
          ['employee_id', 'psychometric_test_id', 'employee_psychometric_evaluation_date'],
          'emp_psych_eval_unique_employee_test_date'
        )

      table.timestamp('employee_psychometric_evaluation_created_at').notNullable()
      table.timestamp('employee_psychometric_evaluation_updated_at').nullable()
      table.timestamp('employee_psychometric_evaluation_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

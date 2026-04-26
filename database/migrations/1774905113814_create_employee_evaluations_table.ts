import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_evaluations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_evaluation_id')

      table.integer('employee_id').unsigned().references('employees.employee_id')
      table.timestamp('employee_evaluation_date').notNullable()
      table.string('employee_evaluation_type', 100).notNullable()
      table.decimal('employee_evaluation_score', 10, 2).nullable()


      table.timestamp('employee_evaluation_created_at').notNullable()
      table.timestamp('employee_evaluation_updated_at').nullable()
      table.timestamp('employee_evaluation_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
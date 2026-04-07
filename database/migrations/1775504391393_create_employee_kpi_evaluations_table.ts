import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_kpi_evaluations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_kpi_evaluation_id')

      table.integer('employee_evaluation_id').unsigned().references('employee_evaluations.employee_evaluation_id')
      table.integer('position_kpi_id').unsigned().references('position_kpis.position_kpi_id')
      table.decimal('employee_kpi_evaluation_score', 12, 4).notNullable()

      table.timestamp('employee_kpi_evaluation_created_at').notNullable()
      table.timestamp('employee_kpi_evaluation_updated_at').nullable()
      table.timestamp('employee_kpi_evaluation_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
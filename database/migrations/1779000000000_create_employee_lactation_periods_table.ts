import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_lactation_periods'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_lactation_period_id').notNullable()

      table
        .integer('employee_id')
        .unsigned()
        .notNullable()
        .references('employee_id')
        .inTable('employees')
        .onDelete('CASCADE')

      table.date('employee_lactation_period_start_date').notNullable()
      table.date('employee_lactation_period_end_date').notNullable()

      // Valores: 'two_rest_periods' | 'reduced_hour'
      table.string('employee_lactation_period_type', 40).notNullable()

      // Valores: 'start' | 'end' | 'split' (default 'end')
      table
        .string('employee_lactation_period_reduction_application', 20)
        .notNullable()
        .defaultTo('end')

      table.string('employee_lactation_period_notes', 500).nullable()

      table.timestamp('employee_lactation_period_created_at').notNullable()
      table.timestamp('employee_lactation_period_updated_at').nullable()
      table.timestamp('employee_lactation_period_deleted_at').nullable()

      table.index(['employee_id'], 'idx_employee_lactation_periods_employee_id')

      table.index(
        [
          'employee_id',
          'employee_lactation_period_end_date',
          'employee_lactation_period_deleted_at',
        ],
        'idx_employee_lactation_periods_active'
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

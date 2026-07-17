import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Desglose auditable de horas extra por semana ISO (doble/triple en minutos).
 *
 * Una fila por (empleado, año ISO, semana ISO). El UNIQUE no incluye
 * `deleted_at`: en MySQL los NULL se tratan como distintos y permitirían
 * duplicados entre filas activas (mismo criterio que `work_journal_entries`).
 */
export default class extends BaseSchema {
  protected tableName = 'overtime_weekly_details'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('overtime_weekly_detail_id').notNullable()

      table.integer('employee_id').unsigned().notNullable().references('employees.employee_id')
      table.integer('business_unit_id').unsigned().notNullable().references('business_units.business_unit_id')
      table.integer('payroll_business_unit_id').unsigned().notNullable().references('business_units.business_unit_id')

      table.smallint('overtime_weekly_detail_iso_year').notNullable()
      table.smallint('overtime_weekly_detail_iso_week').notNullable()

      table.integer('overtime_weekly_detail_double_minutes').notNullable().defaultTo(0)
      table.integer('overtime_weekly_detail_triple_minutes').notNullable().defaultTo(0)
      table.decimal('overtime_weekly_detail_weekly_cap_hours', 5, 2).notNullable()

      table.integer('working_time_rule_id').unsigned().nullable().references('working_time_rules.working_time_rule_id')

      table.timestamp('overtime_weekly_detail_created_at').notNullable()
      table.timestamp('overtime_weekly_detail_updated_at').nullable()
      table.timestamp('overtime_weekly_detail_deleted_at').nullable()

      table.unique(
        ['employee_id', 'overtime_weekly_detail_iso_year', 'overtime_weekly_detail_iso_week'],
        { indexName: 'uq_owd_employee_iso_week' }
      )
      table.index(
        ['payroll_business_unit_id', 'overtime_weekly_detail_iso_year', 'overtime_weekly_detail_iso_week'],
        'idx_owd_payroll_bu_iso_week'
      )
      table.index(
        ['business_unit_id', 'overtime_weekly_detail_iso_year', 'overtime_weekly_detail_iso_week'],
        'idx_owd_bu_iso_week'
      )
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

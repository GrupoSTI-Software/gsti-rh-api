import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employees'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_payroll_code', 100).nullable().after('employee_payroll_num')
      table.string('employee_slug', 255).nullable().after('employee_payroll_code')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_slug')
      table.dropColumn('employee_payroll_code')
    })
  }
}



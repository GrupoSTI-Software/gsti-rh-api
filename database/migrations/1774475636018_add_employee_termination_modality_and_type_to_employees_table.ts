import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employees'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('employee_termination_modality', 120)
        .after('employee_terminated_date')
        .nullable()
      table.string('employee_termination_type', 200).after('employee_termination_modality').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_termination_modality')
      table.dropColumn('employee_termination_type')
    })
  }
}

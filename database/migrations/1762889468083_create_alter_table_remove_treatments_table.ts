import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_medical_conditions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_medical_condition_treatment')
    })
  }
}

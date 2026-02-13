import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_biometrics'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table
        .enum('employee_biometric_status', ['pending', 'enrolling', 'completed', 'failed'])
        .defaultTo('pending')
        .after('employee_biometric_data')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('employee_biometric_status')
    })
  }
}
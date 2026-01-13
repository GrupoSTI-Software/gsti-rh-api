import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employees'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('employee_business_phone', 50)
        .after('employee_business_email')
        .nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_business_phone')
    })
  }
}


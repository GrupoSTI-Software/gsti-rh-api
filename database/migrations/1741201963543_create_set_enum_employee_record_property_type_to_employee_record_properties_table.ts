import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_record_properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('employee_record_property_type', ['Text', 'File', 'Currency', 'Decimal', 'Number'])
        .notNullable()
        .alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_record_property_type', 30).notNullable().alter()
    })
  }
}

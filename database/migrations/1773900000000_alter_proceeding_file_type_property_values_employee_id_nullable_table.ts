import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'proceeding_file_type_property_values'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['employee_id'])
    })
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('employee_id').unsigned().nullable().alter()
    })
    this.schema.alterTable(this.tableName, (table) => {
      table.foreign('employee_id').references('employees.employee_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['employee_id'])
    })
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('employee_id').unsigned().notNullable().alter()
    })
    this.schema.alterTable(this.tableName, (table) => {
      table.foreign('employee_id').references('employees.employee_id')
    })
  }
}

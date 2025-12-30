import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_contracts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('department_id').unsigned().notNullable().after('employee_id')
      table.foreign('department_id').references('departments.department_id')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropForeign(['department_id'])
      table.dropColumn('department_id')
    })
  }
}

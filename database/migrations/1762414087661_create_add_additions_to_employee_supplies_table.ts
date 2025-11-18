import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_supplies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('employee_supply_additions').nullable().after('employee_supply_retirement_reason')
    })
  }
  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_supply_additions')
    })
  }
}

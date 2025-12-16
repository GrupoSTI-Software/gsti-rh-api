import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_supplies'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
        table.timestamp('employee_supply_assignament_date').nullable().after('employee_supply_additions')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_supply_assignament_date')
    })
  }
}

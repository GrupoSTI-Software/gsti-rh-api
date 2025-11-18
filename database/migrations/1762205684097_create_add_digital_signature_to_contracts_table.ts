import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_supplies_response_contracts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_supply_response_contract_digital_signature', 255).nullable().after('employee_supply_response_contract_file')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_supply_response_contract_digital_signature')
    })
  }
}

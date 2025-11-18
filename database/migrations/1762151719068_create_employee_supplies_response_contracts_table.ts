import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_supplies_response_contracts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('employee_supply_response_contract_id')
      table.integer('employee_supply_id').unsigned()
        .references('employee_supply_id')
        .inTable('employee_supplies')
        .notNullable()
        .onDelete('cascade')
      table.string('employee_supply_response_contract_uuid', 250).notNullable()
      table.string('employee_supply_response_contract_file', 255).notNullable()
      table.timestamp('employee_supply_response_contract_created_at').notNullable()
      table.timestamp('employee_supply_response_contract_updated_at').nullable()
      table.timestamp('employee_supply_response_contract_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

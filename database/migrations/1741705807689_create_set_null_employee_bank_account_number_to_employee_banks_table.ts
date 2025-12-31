import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_banks'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_bank_account_number', 250).nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_bank_account_number', 250).notNullable().alter()
    })
  }
}

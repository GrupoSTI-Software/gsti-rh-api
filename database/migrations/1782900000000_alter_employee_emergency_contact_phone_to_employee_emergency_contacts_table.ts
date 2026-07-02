import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_emergency_contacts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_emergency_contact_phone', 191).nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('employee_emergency_contact_phone', 45).nullable().alter()
    })
  }
}

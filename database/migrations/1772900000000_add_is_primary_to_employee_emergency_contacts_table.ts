import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_emergency_contacts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('employee_emergency_contact_is_primary').defaultTo(false).notNullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('employee_emergency_contact_is_primary')
    })
  }
}

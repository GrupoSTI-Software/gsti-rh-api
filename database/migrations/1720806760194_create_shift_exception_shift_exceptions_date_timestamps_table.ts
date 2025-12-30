import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'shift_exceptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('shift_exceptions_date').notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.date('shift_exceptions_date').nullable().alter()
    })
  }
}

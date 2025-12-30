import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_shifts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('employe_shifts_apply_since').notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.date('employe_shifts_apply_since').nullable().alter()
    })
  }
}

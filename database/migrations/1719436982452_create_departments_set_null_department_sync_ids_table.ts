import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'departments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('department_sync_id', 50).nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('department_sync_id', 50).nullable().alter()
    })
  }
}

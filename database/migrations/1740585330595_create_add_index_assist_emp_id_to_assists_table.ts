import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.index('assist_emp_id', 'assist_emp_id_index')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex('assist_emp_id', 'assist_emp_id_index')
    })
  }
}

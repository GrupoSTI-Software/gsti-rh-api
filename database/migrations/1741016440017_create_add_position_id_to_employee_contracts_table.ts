import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'employee_contracts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('position_id').unsigned().notNullable().after('department_id')
      table.foreign('position_id').references('positions.position_id')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropForeign(['position_id'])
      table.dropColumn('position_id')
    })
  }
}

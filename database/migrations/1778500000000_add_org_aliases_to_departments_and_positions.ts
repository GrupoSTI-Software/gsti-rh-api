import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('departments', (table) => {
      table.text('department_aliases').nullable()
    })
    this.schema.alterTable('positions', (table) => {
      table.text('position_aliases').nullable()
    })
  }

  async down() {
    this.schema.alterTable('departments', (table) => {
      table.dropColumn('department_aliases')
    })
    this.schema.alterTable('positions', (table) => {
      table.dropColumn('position_aliases')
    })
  }
}

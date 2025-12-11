import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'exception_types'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('exception_type_can_masive').nullable().defaultTo(0).after('exception_type_active')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('exception_type_can_masive')
    })
  }
}

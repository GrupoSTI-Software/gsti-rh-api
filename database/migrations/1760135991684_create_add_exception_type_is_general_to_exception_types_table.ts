import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'exception_types'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .boolean('exception_type_is_general')
        .after('exception_type_slug')
        .nullable()
        .defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('exception_type_is_general')
    })
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'assists'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('assist_precision', 10, 2).nullable().after('assist_latitude')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('assist_precision')
    })
  }
}

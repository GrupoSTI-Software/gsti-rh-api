import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'api_tokens'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table.string('origin', 20).notNullable().defaultTo('web').after('type')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('origin')
    })
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notices'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('notice_type', ['text', 'image', 'pdf'])
        .after('notice_description')
        .nullable().defaultTo('text')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('notice_type')
    })
  }
}


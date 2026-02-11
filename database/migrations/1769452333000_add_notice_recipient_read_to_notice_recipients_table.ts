import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notice_recipients'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .boolean('notice_recipient_read')
        .notNullable()
        .defaultTo(false)
        .after('notice_recipient_sent_at')
      table
        .timestamp('notice_recipient_read_at')
        .nullable()
        .after('notice_recipient_read')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('notice_recipient_read_at')
      table.dropColumn('notice_recipient_read')
    })
  }
}

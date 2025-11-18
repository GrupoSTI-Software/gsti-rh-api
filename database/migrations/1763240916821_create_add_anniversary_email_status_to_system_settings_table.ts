import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
    table.boolean('system_setting_anniversary_emails')
      .defaultTo(false)
      .after('system_setting_birthday_emails')
      .notNullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('system_setting_anniversary_emails')
    })
  }
}

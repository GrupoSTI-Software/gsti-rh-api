import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    if (!await this.schema.hasColumn(this.tableName, 'system_setting_birthday_emails')) {
      this.schema.alterTable(this.tableName, (table) => {
        table.boolean('system_setting_birthday_emails')
          .after('system_setting_restrict_future_vacation')
          .defaultTo(false)
      })
    }
  }

  async down() {
    if (await this.schema.hasColumn(this.tableName, 'system_setting_birthday_emails')) {
      this.schema.alterTable(this.tableName, (table) => {
        table.dropColumn('system_setting_birthday_emails')
      })
    }
  }
}

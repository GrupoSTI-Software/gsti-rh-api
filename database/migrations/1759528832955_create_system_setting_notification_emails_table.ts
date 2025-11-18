import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_setting_notification_emails'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('system_setting_notification_email_id')
      table.string('email', 200).notNullable()
      table
        .integer('system_setting_id')
        .unsigned()
        .references('system_setting_id')
        .inTable('system_settings')
        .onDelete('CASCADE')
        .notNullable()
      table.timestamp('system_setting_notification_email_deleted_at').nullable()
      table.timestamp('system_setting_notification_email_created_at')
      table.timestamp('system_setting_notification_email_updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_setting_trade_names'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('system_setting_trade_name_id')
      table
        .integer('system_setting_id')
        .unsigned()
        .notNullable()
        .references('system_setting_id')
        .inTable('system_settings')
        .withKeyName('fk_trade_name_system_setting')
        .onDelete('cascade')
      table.string('system_trade_name', 150).notNullable()
      table.string('system_trade_name_logo', 255).nullable()
      table.string('system_trade_name_banner', 255).nullable()
      table.string('system_trade_name_sidebar_color', 25).notNullable()
      table.string('system_trade_name_favicon', 255).nullable()
      table.string('system_trade_name_employee_aplication_icon', 255).nullable()
      table.timestamp('system_setting_created_at').notNullable()
      table.timestamp('system_setting_updated_at').nullable()
      table.timestamp('system_setting_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['system_setting_id'], 'fk_trade_name_system_setting')
    })

    this.schema.dropTable(this.tableName)
  }
}

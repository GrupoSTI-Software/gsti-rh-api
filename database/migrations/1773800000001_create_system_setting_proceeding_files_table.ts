import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_setting_proceeding_files'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('system_setting_proceeding_file_id').notNullable()
      table
        .integer('system_setting_id')
        .unsigned()
        .notNullable()
        .references('system_setting_id')
        .inTable('system_settings')
      table
        .integer('proceeding_file_id')
        .unsigned()
        .notNullable()
        .references('proceeding_file_id')
        .inTable('proceeding_files')
      table.timestamp('system_setting_proceeding_file_created_at').notNullable()
      table.timestamp('system_setting_proceeding_file_updated_at').nullable()
      table.timestamp('system_setting_proceeding_file_deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

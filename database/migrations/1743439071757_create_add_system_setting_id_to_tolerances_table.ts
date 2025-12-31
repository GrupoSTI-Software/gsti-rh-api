import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tolerances'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('system_setting_id').unsigned().nullable().after('tolerance_minutes')
      table.foreign('system_setting_id').references('system_settings.system_setting_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['system_setting_id'])
      table.dropColumn('system_setting_id')
    })
  }
}

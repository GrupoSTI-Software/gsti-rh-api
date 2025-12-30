import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'shift_exceptions'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table.integer('vacation_setting_id').unsigned().nullable()
      table.foreign('vacation_setting_id').references('vacation_settings.vacation_setting_id')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropForeign(['vacation_setting_id'])
      table.dropColumn('vacation_setting_id')
    })
  }
}

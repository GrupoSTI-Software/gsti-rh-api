import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('system_setting_max_absences_before_attendance_lock')
        .after('system_setting_anniversary_emails')
        .nullable().defaultTo(null)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('system_setting_max_absences_before_attendance_lock')
    })
  }
}


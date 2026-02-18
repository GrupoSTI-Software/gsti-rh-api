import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('system_setting_period_absences_before_attendance_lock', ['monthly'])
        .after('system_setting_max_late_arrivals_before_attendance_lock')
        .nullable().defaultTo('monthly')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('system_setting_period_absences_before_attendance_lock')
    })
  }
}


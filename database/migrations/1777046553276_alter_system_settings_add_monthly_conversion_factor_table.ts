import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .decimal('system_setting_monthly_conversion_factor', 5, 2)
        .notNullable()
        .defaultTo(30.4)
        .after('system_setting_period_late_arrivals_before_attendance_lock')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('system_setting_monthly_conversion_factor')
    })
  }
}

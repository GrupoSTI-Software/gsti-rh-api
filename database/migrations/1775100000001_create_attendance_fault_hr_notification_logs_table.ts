import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'attendance_fault_hr_notification_logs'

  async up() {
    const existing = await this.db.rawQuery(
      `SELECT COUNT(*) as count FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [this.tableName]
    )
    if (Number(existing[0]?.[0]?.count ?? 0) > 0) {
      return
    }

    this.schema.createTable(this.tableName, (table) => {
      table.increments('attendance_fault_hr_notification_log_id').notNullable()
      table.integer('employee_assist_calendar_id').unsigned().notNullable()
      table
        .foreign('employee_assist_calendar_id', 'fk_att_fault_hr_logs_assist_cal')
        .references('employee_assist_calendar_id')
        .inTable('employee_assist_calendars')
        .onDelete('CASCADE')
      table.integer('employee_id').unsigned().notNullable()
      table.foreign('employee_id').references('employees.employee_id')
      table
        .integer('system_setting_id')
        .unsigned()
        .notNullable()
        .references('system_setting_id')
        .inTable('system_settings')
        .onDelete('CASCADE')
      table.timestamp('attendance_fault_hr_notification_log_created_at').notNullable()
      table.unique(['employee_assist_calendar_id'], 'uq_att_fault_hr_cal_employee_assist_calendar')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}

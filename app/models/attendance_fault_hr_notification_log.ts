import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import EmployeeAssistCalendar from './employee_assist_calendar.js'
import Employee from './employee.js'
import SystemSetting from './system_setting.js'

/**
 * Registro de envíos de correo a RH por falta de registro de asistencia (evita duplicados).
 */
export default class AttendanceFaultHrNotificationLog extends BaseModel {
  static table = 'attendance_fault_hr_notification_logs'

  @column({ isPrimary: true })
  declare attendanceFaultHrNotificationLogId: number

  @column()
  declare employeeAssistCalendarId: number

  @column()
  declare employeeId: number

  @column()
  declare systemSettingId: number

  @column.dateTime({ autoCreate: true })
  declare attendanceFaultHrNotificationLogCreatedAt: DateTime

  @belongsTo(() => EmployeeAssistCalendar, {
    foreignKey: 'employeeAssistCalendarId',
  })
  declare employeeAssistCalendar: BelongsTo<typeof EmployeeAssistCalendar>

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => SystemSetting, {
    foreignKey: 'systemSettingId',
  })
  declare systemSetting: BelongsTo<typeof SystemSetting>
}

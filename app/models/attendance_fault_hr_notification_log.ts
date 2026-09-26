import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import EmployeeAssistCalendar from './employee_assist_calendar.js'
import Employee from './employee.js'
import SystemSetting from './system_setting.js'
import BusinessUnit from './business_unit.js'

/**
 * Registro de envíos de correo a RH por falta de registro de asistencia (evita duplicados).
 * USRH1784316436879: marca de empresa para defensa en profundidad multi-tenant.
 */
export default class AttendanceFaultHrNotificationLog extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'attendance_fault_hr_notification_logs'

  @column({ isPrimary: true })
  declare attendanceFaultHrNotificationLogId: number

  @column()
  declare employeeAssistCalendarId: number

  @column()
  declare employeeId: number

  @column()
  declare businessUnitId: number

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

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => SystemSetting, {
    foreignKey: 'systemSettingId',
  })
  declare systemSetting: BelongsTo<typeof SystemSetting>
}

import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import SystemSetting from './system_setting.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class SystemSettingsEmployee extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare systemSettingEmployeeId: number

  @column()
  declare systemSettingId: number

  @column()
  declare isActive: boolean

  @column()
  declare employeeLimit: number | null

  @column.dateTime({ columnName: 'system_setting_employee_deleted_at' })
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare systemSettingEmployeeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare systemSettingEmployeeUpdatedAt: DateTime

  @belongsTo(() => SystemSetting, {
    foreignKey: 'systemSettingId',
  })
  declare systemSetting: BelongsTo<typeof SystemSetting>
}
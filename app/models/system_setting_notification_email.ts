import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import SystemSetting from './system_setting.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class SystemSettingNotificationEmail extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare systemSettingNotificationEmailId: number

  @column()
  declare systemSettingId: number

  @column()
  declare email: string

  @column.dateTime({ autoCreate: true })
  declare systemSettingNotificationEmailCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare systemSettingNotificationEmailUpdatedAt: DateTime

  @column.dateTime({ columnName: 'system_setting_notification_email_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => SystemSetting, {
    foreignKey: 'systemSettingId',
  })
  declare systemSetting: BelongsTo<typeof SystemSetting>
}

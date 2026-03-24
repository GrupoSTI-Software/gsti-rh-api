import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import ProceedingFile from './proceeding_file.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import SystemSetting from './system_setting.js'

export default class SystemSettingProceedingFile extends compose(BaseModel, SoftDeletes) {
  static table = 'system_setting_proceeding_files'

  @column({ isPrimary: true })
  declare systemSettingProceedingFileId: number

  @column()
  declare systemSettingId: number

  @column()
  declare proceedingFileId: number

  @column.dateTime({ autoCreate: true })
  declare systemSettingProceedingFileCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare systemSettingProceedingFileUpdatedAt: DateTime

  @column.dateTime({ columnName: 'system_setting_proceeding_file_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => SystemSetting, {
    foreignKey: 'systemSettingId',
  })
  declare systemSetting: BelongsTo<typeof SystemSetting>

  @belongsTo(() => ProceedingFile, {
    foreignKey: 'proceedingFileId',
  })
  declare proceedingFile: BelongsTo<typeof ProceedingFile>
}

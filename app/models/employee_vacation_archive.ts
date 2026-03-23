import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import VacationSetting from './vacation_setting.js'
import EmployeeVacationArchiveContent from './employee_vacation_archive_content.js'

export default class EmployeeVacationArchive extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeVacationArchiveId: number

  @column()
  declare employeeId: number

  @column()
  declare vacationSettingId: number

  @column.dateTime({ autoCreate: true })
  declare employeeVacationArchiveCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeVacationArchiveUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_vacation_archive_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => VacationSetting, {
    foreignKey: 'vacationSettingId',
  })
  declare vacationSetting: BelongsTo<typeof VacationSetting>

  @hasMany(() => EmployeeVacationArchiveContent, {
    foreignKey: 'employeeVacationArchiveId',
  })
  declare contents: HasMany<typeof EmployeeVacationArchiveContent>

  static softDeletes = true
}

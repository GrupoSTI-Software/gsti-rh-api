import { DateTime } from 'luxon'
import { BaseModel, column ,belongsTo} from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import ProceedingFileType from './proceeding_file_type.js'

export default class EmployeeProceedingFileType extends compose(BaseModel, SoftDeletes) {
  static table = 'employee_proceeding_files_types'

  @column({ isPrimary: true })
  declare employeeProceedingFileTypeId: number

  @column()
  declare employeeId: number

  @column()
  declare proceedingFileTypeId: number

  @column.dateTime({ autoCreate: true })
  declare employeeProceedingFileTypeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeProceedingFileTypeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_proceeding_file_type_deleted_at' })
  declare deletedAt: DateTime | null

  static softDeletes = true

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => ProceedingFileType, {
    foreignKey: 'proceedingFileTypeId',
  })
  declare proceedingFileType: BelongsTo<typeof ProceedingFileType>
}

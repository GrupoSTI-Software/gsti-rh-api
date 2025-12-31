import { DateTime } from 'luxon'
import { BaseModel, column ,belongsTo} from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Employee from './employee.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

export default class EmployeeAnnotation extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeAnnotationId: number

  @column()
  declare employeeId: number

  @column()
  declare employeeAnnotationContent: string

  @column()
  declare employeeAnnotationActive: boolean

  @column()
  declare userId: number

  @column.dateTime({ autoCreate: true })
  declare employeeAnnotationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeAnnotationUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_annotation_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => User, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof User>

  static softDeletes = true
}

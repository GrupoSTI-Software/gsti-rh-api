import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from '#models/employee'
import Certification from '#models/certification'

export default class EmployeeCertification extends compose(BaseModel, SoftDeletes) {
  static table = 'employee_certifications'

  @column({ isPrimary: true })
  declare employeeCertificationId: number

  @column()
  declare employeeId: number

  @column()
  declare certificationId: number

  @column.date()
  declare employeeCertificationCompliedAt: DateTime

  @column.date()
  declare employeeCertificationExpiresAt: DateTime | null

  /** Se llena en la historia de upload; no expuesto en esta historia. */
  @column()
  declare employeeCertificationDocumentUrl: string | null

  @column.dateTime({ autoCreate: true })
  declare employeeCertificationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeCertificationUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'employee_certification_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => Certification, {
    foreignKey: 'certificationId',
  })
  declare certification: BelongsTo<typeof Certification>
}

import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Certification from '#models/certification'

export default class CertificationCategory extends BaseModel {
  static table = 'certification_categories'

  @column({ isPrimary: true })
  declare certificationCategoryId: number

  @column()
  declare certificationCategoryKey: string

  @column()
  declare certificationCategoryName: string

  @column()
  declare certificationCategoryDisplayOrder: number

  /** 1 activa, 0 inactiva */
  @column()
  declare certificationCategoryIsActive: number

  @column.dateTime({ autoCreate: true, columnName: 'certification_category_created_at' })
  declare certificationCategoryCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'certification_category_updated_at' })
  declare certificationCategoryUpdatedAt: DateTime | null

  @hasMany(() => Certification, {
    foreignKey: 'categoryId',
  })
  declare certifications: HasMany<typeof Certification>
}

import { BaseModel, belongsTo, column, manyToMany } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import CertificationCategory from '#models/certification_category'
import BusinessUnit from '#models/business_unit'

export default class Certification extends BaseModel {
  static table = 'certifications'

  @column({ isPrimary: true })
  declare certificationId: number

  @column({ columnName: 'category_id' })
  declare categoryId: number

  @column()
  declare certificationName: string

  @column({ columnName: 'is_external' })
  declare isExternal: boolean

  @column()
  declare externalUrl: string | null

  @column()
  declare renewalPeriodDays: number | null

  @column.dateTime({ autoCreate: true, columnName: 'certification_created_at' })
  declare certificationCreatedAt: DateTime

  @column.dateTime({
    autoCreate: true,
    autoUpdate: true,
    columnName: 'certification_updated_at',
  })
  declare certificationUpdatedAt: DateTime | null

  @belongsTo(() => CertificationCategory, {
    foreignKey: 'categoryId',
    localKey: 'certificationCategoryId',
  })
  declare category: BelongsTo<typeof CertificationCategory>

  @manyToMany(() => BusinessUnit, {
    pivotTable: 'business_unit_certifications',
    localKey: 'certificationId',
    pivotForeignKey: 'certification_id',
    relatedKey: 'businessUnitId',
    pivotRelatedForeignKey: 'business_unit_id',
  })
  declare businessUnits: ManyToMany<typeof BusinessUnit>
}

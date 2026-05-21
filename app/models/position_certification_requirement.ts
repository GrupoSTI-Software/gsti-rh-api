import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Position from '#models/position'
import Certification from '#models/certification'

export default class PositionCertificationRequirement extends compose(BaseModel, SoftDeletes) {
  static table = 'position_certification_requirements'

  @column({ isPrimary: true })
  declare positionCertificationRequirementId: number

  @column()
  declare positionId: number

  @column()
  declare certificationId: number

  @column.dateTime({ autoCreate: true })
  declare positionCertificationRequirementCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionCertificationRequirementUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'position_certification_requirement_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>

  @belongsTo(() => Certification, {
    foreignKey: 'certificationId',
  })
  declare certification: BelongsTo<typeof Certification>
}

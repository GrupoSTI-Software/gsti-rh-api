import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Position from './position.js'
import Weight from './weight.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      PositionCompetency:
 *        type: object
 *        properties:
 *          positionCompetencyId:
 *            type: number
 *            description: Position competency id
 *          positionId:
 *            type: number
 *            description: Position id
 *          weightId:
 *            type: number
 *            description: Position competency weight
 *          competencyId:
 *            type: number
 *            description: Competency id
 *          positionCompetencyName:
 *            type: string
 *            description: Position competency name
 *          positionCompetencyType:
 *            type: string
 *            description: Position competency type
 *          positionCompetencyCreatedAt:
 *            type: string
 *            description: Position competency created at
 *          positionCompetencyUpdatedAt:
 *            type: string
 *            description: Position competency updated at
 *          positionCompetencyDeletedAt:
 *            type: string
 *            description: Position competency deleted at
 */

export default class PositionCompetency extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare positionCompetencyId: number

  @column()
  declare positionId: number

  @column()
  declare weightId: number

  @column()
  declare competencyId: number

  @column()
  declare positionCompetencyName: string

  @column()
  declare positionCompetencyType: string

  @column.dateTime({ autoCreate: true })
  declare positionCompetencyCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionCompetencyUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_competency_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>

  @belongsTo(() => Weight, {
    foreignKey: 'weightId',
  })
  declare weight: BelongsTo<typeof Weight>
}

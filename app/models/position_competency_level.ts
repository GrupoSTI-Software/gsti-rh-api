import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Position from './position.js'
import Competency from './competency.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      PositionCompetencyLevel:
 *        type: object
 *        properties:
 *          positionCompetencyLevelId:
 *            type: number
 *            description: Position competency level id
 *          positionId:
 *            type: number
 *            description: Position id
 *          competencyId:
 *            type: number
 *            description: Competency id
 *          positionCompetencyLevelInDevelopmentDescription:
 *            type: string
 *            description: Descripcion del nivel En desarrollo
 *          positionCompetencyLevelCapableDescription:
 *            type: string
 *            description: Descripcion del nivel Capaz
 *          positionCompetencyLevelExpertDescription:
 *            type: string
 *            description: Descripcion del nivel Experto
 *          positionCompetencyLevelCreatedAt:
 *            type: string
 *          positionCompetencyLevelUpdatedAt:
 *            type: string
 *          positionCompetencyLevelDeletedAt:
 *            type: string
 */

export default class PositionCompetencyLevel extends compose(BaseModel, SoftDeletes) {
  static table = 'position_competency_levels'

  @column({ isPrimary: true })
  declare positionCompetencyLevelId: number

  @column()
  declare positionId: number

  @column()
  declare competencyId: number

  @column()
  declare positionCompetencyLevelInDevelopmentDescription: string | null

  @column()
  declare positionCompetencyLevelCapableDescription: string | null

  @column()
  declare positionCompetencyLevelExpertDescription: string | null

  @column.dateTime({ autoCreate: true })
  declare positionCompetencyLevelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionCompetencyLevelUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_competency_level_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>

  @belongsTo(() => Competency, {
    foreignKey: 'competencyId',
  })
  declare competency: BelongsTo<typeof Competency>
}

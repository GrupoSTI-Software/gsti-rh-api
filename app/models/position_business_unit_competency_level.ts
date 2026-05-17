import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Position from './position.js'
import Competency from './competency.js'
import BusinessUnitCompetencyLevel from './business_unit_competency_level.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      PositionBusinessUnitCompetencyLevel:
 *        type: object
 *        properties:
 *          positionBusinessUnitCompetencyLevelId:
 *            type: number
 *            description: Position business unit competency level id
 *          positionId:
 *            type: number
 *            description: Position id
 *          competencyId:
 *            type: number
 *            description: Competency id
 *          businessUnitCompetencyLevelId:
 *            type: number
 *            description: Desired business unit competency level id
 *          positionBusinessUnitCompetencyLevelCreatedAt:
 *            type: string
 *          positionBusinessUnitCompetencyLevelUpdatedAt:
 *            type: string
 *          positionBusinessUnitCompetencyLevelDeletedAt:
 *            type: string
 */

export default class PositionBusinessUnitCompetencyLevel extends compose(BaseModel, SoftDeletes) {
  static table = 'position_business_unit_competency_levels'

  @column({ isPrimary: true })
  declare positionBusinessUnitCompetencyLevelId: number

  @column()
  declare positionId: number

  @column()
  declare competencyId: number

  @column()
  declare businessUnitCompetencyLevelId: number

  @column.dateTime({ autoCreate: true })
  declare positionBusinessUnitCompetencyLevelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionBusinessUnitCompetencyLevelUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_business_unit_competency_level_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>

  @belongsTo(() => Competency, {
    foreignKey: 'competencyId',
  })
  declare competency: BelongsTo<typeof Competency>

  @belongsTo(() => BusinessUnitCompetencyLevel, {
    foreignKey: 'businessUnitCompetencyLevelId',
  })
  declare businessUnitCompetencyLevel: BelongsTo<typeof BusinessUnitCompetencyLevel>
}

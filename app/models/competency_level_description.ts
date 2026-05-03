import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Competency from './competency.js'
import CompetencyLevel from './competency_level.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      CompetencyLevelDescription:
 *        type: object
 *        properties:
 *          competencyLevelDescriptionId:
 *            type: number
 *            description: Competency level description id
 *          competencyId:
 *            type: number
 *            description: Competency id
 *          competencyLevelId:
 *            type: number
 *            description: Competency level id
 *          competencyLevelDescription:
 *            type: string
 *            description: Description text for the given competency and level
 *          competencyLevelDescriptionCreatedAt:
 *            type: string
 *          competencyLevelDescriptionUpdatedAt:
 *            type: string
 *          competencyLevelDescriptionDeletedAt:
 *            type: string
 */

export default class CompetencyLevelDescription extends compose(BaseModel, SoftDeletes) {
  static table = 'competency_level_descriptions'

  @column({ isPrimary: true })
  declare competencyLevelDescriptionId: number

  @column()
  declare competencyId: number

  @column()
  declare competencyLevelId: number

  @column()
  declare competencyLevelDescription: string

  @column.dateTime({ autoCreate: true })
  declare competencyLevelDescriptionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare competencyLevelDescriptionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'competency_level_description_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Competency, {
    foreignKey: 'competencyId',
  })
  declare competency: BelongsTo<typeof Competency>

  @belongsTo(() => CompetencyLevel, {
    foreignKey: 'competencyLevelId',
  })
  declare competencyLevel: BelongsTo<typeof CompetencyLevel>
}

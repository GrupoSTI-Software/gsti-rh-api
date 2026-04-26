import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import PositionCompetencyLevel from './position_competency_level.js'
import CompetencyLevelDescription from './competency_level_description.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      Competency:
 *        type: object
 *        properties:
 *          competencyId:
 *            type: number
 *            description: Competency id
 *          competencyName:
 *            type: string
 *            description: Competency name
 *          competencyType:
 *            type: string
 *            enum: [technical, transversal]
 *            description: Competency type
 *          competencyCreatedAt:
 *            type: string
 *            description: Competency created at
 *          competencyUpdatedAt:
 *            type: string
 *            description: Competency updated at
 *          competencyDeletedAt:
 *            type: string
 *            description: Competency deleted at
 *          levelDescriptions:
 *            type: array
 *            description: Descriptions for each competency level
 *            items:
 *              $ref: '#/components/schemas/CompetencyLevelDescription'
 */

export default class Competency extends compose(BaseModel, SoftDeletes) {
  static table = 'competencies'

  @column({ isPrimary: true })
  declare competencyId: number

  @column()
  declare competencyName: string

  @column()
  declare competencyType: 'technical' | 'transversal'

  @column.dateTime({ autoCreate: true })
  declare competencyCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare competencyUpdatedAt: DateTime

  @column.dateTime({ columnName: 'competency_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => PositionCompetencyLevel, {
    foreignKey: 'competencyId',
  })
  declare positionLevels: HasMany<typeof PositionCompetencyLevel>

  @hasMany(() => CompetencyLevelDescription, {
    foreignKey: 'competencyId',
  })
  declare levelDescriptions: HasMany<typeof CompetencyLevelDescription>
}

import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import CompetencyLevelDescription from './competency_level_description.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      CompetencyLevel:
 *        type: object
 *        properties:
 *          competencyLevelId:
 *            type: number
 *            description: Competency level id
 *          competencyLevelCode:
 *            type: string
 *            description: Competency level code (in_development, capable, expert)
 *          competencyLevelName:
 *            type: string
 *            description: Competency level display name
 *          competencyLevelOrder:
 *            type: number
 *            description: Competency level order
 *          competencyLevelCreatedAt:
 *            type: string
 *          competencyLevelUpdatedAt:
 *            type: string
 *          competencyLevelDeletedAt:
 *            type: string
 */

export default class CompetencyLevel extends compose(BaseModel, SoftDeletes) {
  static table = 'competency_levels'

  @column({ isPrimary: true })
  declare competencyLevelId: number

  @column()
  declare competencyLevelCode: string

  @column()
  declare competencyLevelName: string

  @column()
  declare competencyLevelOrder: number

  @column.dateTime({ autoCreate: true })
  declare competencyLevelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare competencyLevelUpdatedAt: DateTime

  @column.dateTime({ columnName: 'competency_level_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => CompetencyLevelDescription, {
    foreignKey: 'competencyLevelId',
  })
  declare descriptions: HasMany<typeof CompetencyLevelDescription>
}

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * @swagger
 * components:
 *   schemas:
 *     BusinessUnitCompetencyLevel:
 *       type: object
 *       properties:
 *         businessUnitCompetencyLevelId:
 *           type: number
 *           description: Business unit competency level id
 *         businessUnitId:
 *           type: number
 *           description: Business unit id
 *         businessUnitCompetencyLevelLabel:
 *           type: string
 *           description: Business unit competency level label
 *         businessUnitCompetencyLevelPosition:
 *           type: number
 *           description: Business unit competency level position
 *         businessUnitCompetencyLevelCreatedAt:
 *           type: string
 *           description: Business unit competency level created at
 *         businessUnitCompetencyLevelUpdatedAt:
 *           type: string
 *           description: Business unit competency level updated at
 *         businessUnitCompetencyLevelDeletedAt:
 *           type: string
 *           description: Business unit competency level deleted at
 */
export default class BusinessUnitCompetencyLevel extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare businessUnitCompetencyLevelId: number

  @column()
  declare businessUnitId: number

  @column()
  declare businessUnitCompetencyLevelLabel: string

  @column()
  declare businessUnitCompetencyLevelPosition: number

  @column.dateTime({ autoCreate: true })
  declare businessUnitCompetencyLevelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare businessUnitCompetencyLevelUpdatedAt: DateTime

  @column.dateTime({ columnName: 'business_unit_competency_level_deleted_at' })
  declare deletedAt: DateTime | null
}



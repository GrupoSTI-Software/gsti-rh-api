import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * @swagger
 * components:
 *   schemas:
 *     CompanyCompetencyLevel:
 *       type: object
 *       properties:
 *         companyCompetencyLevelId:
 *           type: number
 *           description: Company competency level id
 *         businessUnitId:
 *           type: number
 *           description: Business unit id
 *         companyCompetencyLevelLabel:
 *           type: string
 *           description: Company competency level label
 *         companyCompetencyLevelPosition:
 *           type: number
 *           description: Company competency level position
 *         companyCompetencyLevelCreatedAt:
 *           type: string
 *           description: Company competency level created at
 *         companyCompetencyLevelUpdatedAt:
 *           type: string
 *           description: Company competency level updated at
 *         companyCompetencyLevelDeletedAt:
 *           type: string
 *           description: Company competency level deleted at
 */
export default class CompanyCompetencyLevel extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare companyCompetencyLevelId: number

  @column()
  declare businessUnitId: number

  @column()
  declare companyCompetencyLevelLabel: string

  @column()
  declare companyCompetencyLevelPosition: number

  @column.dateTime({ autoCreate: true })
  declare companyCompetencyLevelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare companyCompetencyLevelUpdatedAt: DateTime

  @column.dateTime({ columnName: 'company_competency_level_deleted_at' })
  declare companyCompetencyLevelDeletedAt: DateTime | null
}



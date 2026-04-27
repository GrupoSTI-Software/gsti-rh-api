import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import AssessmentTemplate from './assessment_template.js'
import PositionAssessmentProfile from './position_assessment_profile.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     AssessmentTemplateDimension:
 *       type: object
 *       properties:
 *         assessmentTemplateDimensionId:
 *           type: number
 *           description: Identificador único de la dimensión
 *         assessmentTemplateId:
 *           type: number
 *           description: Identificador de la plantilla de evaluación
 *         assessmentTemplateDimensionName:
 *           type: string
 *           description: Nombre de la dimensión
 *         assessmentTemplateDimensionAcronym:
 *           type: string
 *           description: Sigla de la dimensión
 *         assessmentTemplateDimensionCreatedAt:
 *           type: string
 *         assessmentTemplateDimensionUpdatedAt:
 *           type: string
 *         assessmentTemplateDimensionDeletedAt:
 *           type: string
 */
export default class AssessmentTemplateDimension extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare assessmentTemplateDimensionId: number

  @column()
  declare assessmentTemplateId: number

  @column()
  declare assessmentTemplateDimensionName: string

  @column()
  declare assessmentTemplateDimensionAcronym: string

  @column.dateTime({ autoCreate: true })
  declare assessmentTemplateDimensionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare assessmentTemplateDimensionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'assessment_template_dimension_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => AssessmentTemplate, {
    foreignKey: 'assessmentTemplateId',
  })
  declare assessmentTemplate: BelongsTo<typeof AssessmentTemplate>

  @hasMany(() => PositionAssessmentProfile, {
    foreignKey: 'assessmentTemplateDimensionId',
  })
  declare positionAssessmentProfiles: HasMany<typeof PositionAssessmentProfile>
}

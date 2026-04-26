import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Position from './position.js'
import AssessmentTemplateDimension from './assessment_template_dimension.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     PositionAssessmentProfile:
 *       type: object
 *       properties:
 *         positionAssessmentProfileId:
 *           type: number
 *           description: Identificador único del perfil de evaluación del puesto
 *         positionId:
 *           type: number
 *           description: Identificador del puesto
 *         assessmentTemplateDimensionId:
 *           type: number
 *           description: Identificador de la dimensión de la plantilla
 *         positionAssessmentProfileMinimumValue:
 *           type: number
 *           format: double
 *           description: Valor mínimo esperado
 *         positionAssessmentProfileMaximumValue:
 *           type: number
 *           format: double
 *           description: Valor máximo esperado
 *         positionAssessmentProfileCreatedAt:
 *           type: string
 *         positionAssessmentProfileUpdatedAt:
 *           type: string
 *         positionAssessmentProfileDeletedAt:
 *           type: string
 */
export default class PositionAssessmentProfile extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare positionAssessmentProfileId: number

  @column()
  declare positionId: number

  @column()
  declare assessmentTemplateDimensionId: number

  @column()
  declare positionAssessmentProfileMinimumValue: number

  @column()
  declare positionAssessmentProfileMaximumValue: number

  @column.dateTime({ autoCreate: true })
  declare positionAssessmentProfileCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionAssessmentProfileUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_assessment_profile_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>

  @belongsTo(() => AssessmentTemplateDimension, {
    foreignKey: 'assessmentTemplateDimensionId',
  })
  declare assessmentTemplateDimension: BelongsTo<typeof AssessmentTemplateDimension>
}

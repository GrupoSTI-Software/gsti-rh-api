import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Position from './position.js'
import AssessmentTemplateDimension from './assessment_template_dimension.js'

/**
 * Valores admitidos para una dimensión de tipo `categorical_amb`
 * (Alto / Medio / Bajo). Los códigos son agnósticos al idioma; el front
 * mapea cada uno a su etiqueta localizada.
 */
export type AssessmentCategoricalValue = 'high' | 'medium' | 'low'

export const ASSESSMENT_CATEGORICAL_VALUES: readonly AssessmentCategoricalValue[] = [
  'high',
  'medium',
  'low',
] as const

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
 *           nullable: true
 *           description: Valor mínimo esperado (sólo aplica para tipos numeric/percent)
 *         positionAssessmentProfileMaximumValue:
 *           type: number
 *           format: double
 *           nullable: true
 *           description: Valor máximo esperado (sólo aplica para tipos numeric/percent)
 *         positionAssessmentProfileExpectedValue:
 *           type: string
 *           enum: [high, medium, low]
 *           nullable: true
 *           description: Valor único esperado (sólo aplica para tipo categorical_amb)
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
  declare positionAssessmentProfileMinimumValue: number | null

  @column()
  declare positionAssessmentProfileMaximumValue: number | null

  @column()
  declare positionAssessmentProfileExpectedValue: AssessmentCategoricalValue | null

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

import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import EmployeeAssessment from './employee_assessment.js'
import AssessmentTemplateDimension from './assessment_template_dimension.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeAssessmentResult:
 *       type: object
 *       properties:
 *         employeeAssessmentResultId:
 *           type: number
 *           description: Identificador único del resultado
 *         employeeAssessmentId:
 *           type: number
 *           description: Identificador de la evaluación del empleado
 *         assessmentTemplateDimensionId:
 *           type: number
 *           description: Identificador de la dimensión de la plantilla
 *         employeeAssessmentResultValue:
 *           type: string
 *           description: Valor registrado (alfanumérico)
 *         employeeAssessmentResultStatus:
 *           type: string
 *           description: Estado del resultado (insufficient, approved, excellent, null)
 *         employeeAssessmentResultCreatedAt:
 *           type: string
 *         employeeAssessmentResultUpdatedAt:
 *           type: string
 *         employeeAssessmentResultDeletedAt:
 *           type: string
 */
export default class EmployeeAssessmentResult extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeAssessmentResultId: number

  @column()
  declare employeeAssessmentId: number

  @column()
  declare assessmentTemplateDimensionId: number

  @column()
  declare employeeAssessmentResultValue: string | null

  @column()
  declare employeeAssessmentResultStatus: string | null

  @column.dateTime({ autoCreate: true })
  declare employeeAssessmentResultCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeAssessmentResultUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_assessment_result_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => EmployeeAssessment, {
    foreignKey: 'employeeAssessmentId',
  })
  declare assessment: BelongsTo<typeof EmployeeAssessment>

  @belongsTo(() => AssessmentTemplateDimension, {
    foreignKey: 'assessmentTemplateDimensionId',
  })
  declare assessmentTemplateDimension: BelongsTo<typeof AssessmentTemplateDimension>
}

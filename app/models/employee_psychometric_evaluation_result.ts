import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import EmployeePsychometricEvaluation from './employee_psychometric_evaluation.js'
import PsychometricTestDimension from './psychometric_test_dimension.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeePsychometricEvaluationResult:
 *       type: object
 *       properties:
 *         employeePsychometricEvaluationResultId:
 *           type: number
 *           description: Identificador único del resultado
 *         employeePsychometricEvaluationId:
 *           type: number
 *           description: Identificador de la evaluación psicométrica
 *         psychometricTestDimensionId:
 *           type: number
 *           description: Identificador de la dimensión de la prueba
 *         employeePsychometricEvaluationResultValue:
 *           type: string
 *           description: Valor registrado (alfanumérico)
 *         employeePsychometricEvaluationResultStatus:
 *           type: string
 *           description: Estado del resultado (insufficient, approved, excellent, null)
 *         employeePsychometricEvaluationResultCreatedAt:
 *           type: string
 *         employeePsychometricEvaluationResultUpdatedAt:
 *           type: string
 *         employeePsychometricEvaluationResultDeletedAt:
 *           type: string
 */
export default class EmployeePsychometricEvaluationResult extends compose(
  BaseModel,
  SoftDeletes
) {
  @column({ isPrimary: true })
  declare employeePsychometricEvaluationResultId: number

  @column()
  declare employeePsychometricEvaluationId: number

  @column()
  declare psychometricTestDimensionId: number

  @column()
  declare employeePsychometricEvaluationResultValue: string | null

  @column()
  declare employeePsychometricEvaluationResultStatus: string | null

  @column.dateTime({ autoCreate: true })
  declare employeePsychometricEvaluationResultCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeePsychometricEvaluationResultUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_psychometric_evaluation_result_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => EmployeePsychometricEvaluation, {
    foreignKey: 'employeePsychometricEvaluationId',
  })
  declare evaluation: BelongsTo<typeof EmployeePsychometricEvaluation>

  @belongsTo(() => PsychometricTestDimension, {
    foreignKey: 'psychometricTestDimensionId',
  })
  declare psychometricTestDimension: BelongsTo<typeof PsychometricTestDimension>
}

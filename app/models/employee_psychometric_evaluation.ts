import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Employee from './employee.js'
import PsychometricTest from './psychometric_test.js'
import EmployeePsychometricEvaluationResult from './employee_psychometric_evaluation_result.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeePsychometricEvaluation:
 *       type: object
 *       properties:
 *         employeePsychometricEvaluationId:
 *           type: number
 *           description: Identificador único de la evaluación psicométrica del empleado
 *         employeeId:
 *           type: number
 *           description: Identificador del empleado
 *         psychometricTestId:
 *           type: number
 *           description: Identificador de la prueba psicométrica
 *         employeePsychometricEvaluationDate:
 *           type: string
 *           format: date
 *           description: Fecha de aplicación de la evaluación
 *         employeePsychometricEvaluationStatus:
 *           type: string
 *           description: Estado general de la evaluación (pending, approved, failed)
 *         employeePsychometricEvaluationCreatedAt:
 *           type: string
 *         employeePsychometricEvaluationUpdatedAt:
 *           type: string
 *         employeePsychometricEvaluationDeletedAt:
 *           type: string
 */
export default class EmployeePsychometricEvaluation extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeePsychometricEvaluationId: number

  @column()
  declare employeeId: number

  @column()
  declare psychometricTestId: number

  @column.date()
  declare employeePsychometricEvaluationDate: DateTime

  @column()
  declare employeePsychometricEvaluationStatus: string

  @column.dateTime({ autoCreate: true })
  declare employeePsychometricEvaluationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeePsychometricEvaluationUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_psychometric_evaluation_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => PsychometricTest, {
    foreignKey: 'psychometricTestId',
  })
  declare psychometricTest: BelongsTo<typeof PsychometricTest>

  @hasMany(() => EmployeePsychometricEvaluationResult, {
    foreignKey: 'employeePsychometricEvaluationId',
  })
  declare results: HasMany<typeof EmployeePsychometricEvaluationResult>
}

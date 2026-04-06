import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import PsychometricTestDimension from './psychometric_test_dimension.js'
import EmployeePsychometricEvaluation from './employee_psychometric_evaluation.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     PsychometricTest:
 *       type: object
 *       properties:
 *         psychometricTestId:
 *           type: number
 *           description: Identificador único de la prueba psicométrica
 *         psychometricTestName:
 *           type: string
 *           description: Nombre de la prueba psicométrica
 *         psychometricTestDescription:
 *           type: string
 *           description: Descripción de la prueba psicométrica
 *         psychometricTestCreatedAt:
 *           type: string
 *         psychometricTestUpdatedAt:
 *           type: string
 *         psychometricTestDeletedAt:
 *           type: string
 */
export default class PsychometricTest extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare psychometricTestId: number

  @column()
  declare psychometricTestName: string

  @column()
  declare psychometricTestDescription: string | null

  @column.dateTime({ autoCreate: true })
  declare psychometricTestCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare psychometricTestUpdatedAt: DateTime

  @column.dateTime({ columnName: 'psychometric_test_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => PsychometricTestDimension, {
    foreignKey: 'psychometricTestId',
  })
  declare dimensions: HasMany<typeof PsychometricTestDimension>

  @hasMany(() => EmployeePsychometricEvaluation, {
    foreignKey: 'psychometricTestId',
  })
  declare employeeEvaluations: HasMany<typeof EmployeePsychometricEvaluation>
}

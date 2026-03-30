import { DateTime } from 'luxon'
import { BaseModel, column ,belongsTo} from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Employee from './employee.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class EmployeeEvaluation extends compose(BaseModel, SoftDeletes) {

/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeEvaluation:
 *        type: object
 *        properties:
 *          employeeEvaluationId:
 *            type: number
 *            description: Employee evaluation id
 *          employeeId:
 *            type: number
 *            description: Employee id
 *          employeeEvaluationDate:
 *            type: string
 *            description: Employee evaluation date
 *          employeeEvaluationType:
 *            type: string
 *            description: Employee evaluation type
 *          employeeEvaluationScore:
 *            type: number
 *            description: Employee evaluation score
 *          employeeEvaluationCreatedAt:
 *            type: string
 *            description: Employee evaluation created at
 *          employeeEvaluationUpdatedAt:
 *            type: string
 *            description: Employee evaluation updated at
 *          employeeEvaluationDeletedAt:
 *            type: string
 *            description: Employee evaluation deleted at
 */
  @column({ isPrimary: true })
  declare employeeEvaluationId: number

  @column()
  declare employeeId: number

  @column()
  declare employeeEvaluationDate: Date | string

  @column()
  declare employeeEvaluationType: string

  @column()
  declare employeeEvaluationScore: number | null

  @column.dateTime({ autoCreate: true })
  declare employeeEvaluationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeEvaluationUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_evaluation_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  static softDeletes = true
}

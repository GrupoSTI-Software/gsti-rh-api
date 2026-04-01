import { BaseModel, column ,belongsTo} from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import EmployeeEvaluation from './employee_evaluation.js'
import { DateTime } from 'luxon'
/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeCompetencyEvaluation:
 *        type: object
 *        properties:
 *          employeeCompetencyEvaluationId:
 *            type: number
 *            description: Employee competency evaluation id
 *          employeeEvaluationId:
 *            type: number
 *            description: Employee evaluation id
 *          positionCompetencyId:
 *            type: number
 *            description: Position competency id
 *          weightId:
 *            type: number
 *            description: Weight id
 *          employeeCompetencyEvaluationCreatedAt:
 *            type: string
 *          employeeCompetencyEvaluationUpdatedAt:
 *            type: string
 *          employeeCompetencyEvaluationDeletedAt:
 *            type: string
 *
 */

export default class EmployeeCompetencyEvaluation extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeCompetencyEvaluationId: number

  @column()
  declare employeeEvaluationId: number

  @column()
  declare positionCompetencyId: number

  @column()
  declare weightId: number

  @column.dateTime({ autoCreate: true })
  declare employeeCompetencyEvaluationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeCompetencyEvaluationUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_competency_evaluation_deleted_at' })
  declare deletedAt: DateTime | null  

  @belongsTo(() => EmployeeEvaluation, {
    foreignKey: 'employeeEvaluationId',
  })
  declare employeeEvaluation: BelongsTo<typeof EmployeeEvaluation>

  static softDeletes = true
}

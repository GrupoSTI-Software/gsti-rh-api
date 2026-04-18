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
 *      EmployeeKpiEvaluation:
 *        type: object
 *        properties:
 *          employeeKpiEvaluationId:
 *            type: number
 *            description: Employee kpi evaluation id
 *          employeeEvaluationId:
 *            type: number
 *            description: Employee evaluation id
 *          positionKpiId:
 *            type: number
 *            description: Position kpi id
 *          employeeKpiEvaluationScore:
 *            type: number
 *            description: Employee kpi evaluation score
 *          employeeKpiEvaluationCreatedAt:
 *            type: string
 *          employeeKpiEvaluationUpdatedAt:
 *            type: string
 *          employeeKpiEvaluationDeletedAt:
 *            type: string
 *
 */

export default class EmployeeKpiEvaluation extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeKpiEvaluationId: number

  @column()
  declare employeeEvaluationId: number

  @column()
  declare positionKpiId: number

  @column()
  declare employeeKpiEvaluationScore: number

  @column.dateTime({ autoCreate: true })
  declare employeeKpiEvaluationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeKpiEvaluationUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_kpi_evaluation_deleted_at' })
  declare deletedAt: DateTime | null  

  @belongsTo(() => EmployeeEvaluation, {
    foreignKey: 'employeeEvaluationId',
  })
  declare employeeEvaluation: BelongsTo<typeof EmployeeEvaluation>

  static softDeletes = true
}

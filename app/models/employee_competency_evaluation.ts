import { BaseModel, column ,belongsTo} from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import EmployeeEvaluation from './employee_evaluation.js'
import { DateTime } from 'luxon'
import BusinessUnitCompetencyLevel from './business_unit_competency_level.js'
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
 *          positionBusinessUnitCompetencyLevelId:
 *            type: number
 *            description: Position business unit competency level id
 *          businessUnitCompetencyLevelId:
 *            type: number
 *            description: Business unit competency level id
 *          competencyBracketId:
 *            type: number
 *            description: Competency bracket id
 *          employeeCompetencyEvaluationScore:
 *            type: number
 *            description: Employee competency evaluation score
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
  declare positionBusinessUnitCompetencyLevelId: number

  @column()
  declare businessUnitCompetencyLevelId: number

  @column()
  declare competencyBracketId: number

  @column()
  declare employeeCompetencyEvaluationScore: number

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

  @belongsTo(() => BusinessUnitCompetencyLevel, {
    foreignKey: 'businessUnitCompetencyLevelId',
  })
  declare businessUnitCompetencyLevel: BelongsTo<typeof BusinessUnitCompetencyLevel>

  static softDeletes = true
}
